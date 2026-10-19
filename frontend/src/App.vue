<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { applyPipeline, healDab } from './retouch.js'

const fileInput = ref(null)
const viewCanvas = ref(null)
const stageRef = ref(null)

const compare = ref(0.52)
const showCompare = ref(true)
const busy = ref(false)
const hasImage = ref(false)
const mode = ref('adjust') // adjust | heal
const brush = ref(32)
const dragging = ref(false) // file drag over
const toast = ref('')
const error = ref('')
const peekOriginal = ref(false)
const fileName = ref('')
const undoCount = ref(0)

const smooth = ref(0.42)
const brightness = ref(4)
const contrast = ref(6)
const warmth = ref(8)

const blurPx = computed(() => Math.round(2 + smooth.value * 9))

let source = null
let working = null
let painted = null
let dragHeal = false
let dragCompare = false
let toastTimer = 0
let rerenderTimer = 0
let rerenderEpoch = 0
const undoStack = [] // ImageData snapshots of working
const MAX_UNDO = 12
const MAX_SIDE = 1600

const stepHint = computed(() => {
  if (!hasImage.value) return '1 · Загрузи селфи'
  if (mode.value === 'adjust') return '2 · Подкрути кожу или жми «Красиво»'
  return '3 · Кистью пройди по прыщам → Скачать'
})

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2200)
}

function pickFile() {
  fileInput.value?.click()
}

function loadFile(f) {
  if (!f) return
  if (!f.type.startsWith('image/')) {
    error.value = 'Нужен файл изображения (JPG, PNG, WEBP)'
    return
  }
  error.value = ''
  const fake = { target: { files: [f], value: '' } }
  onFile(fake)
}

async function onFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  if (!f.type.startsWith('image/')) {
    error.value = 'Нужен файл изображения (JPG, PNG, WEBP)'
    e.target.value = ''
    return
  }
  busy.value = true
  error.value = ''
  try {
    const bmp = await createImageBitmap(f)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    source = document.createElement('canvas')
    source.width = w
    source.height = h
    source.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    working = document.createElement('canvas')
    working.width = w
    working.height = h
    working.getContext('2d').drawImage(source, 0, 0)
    undoStack.length = 0
    undoCount.value = 0
    fileName.value = f.name || 'photo.jpg'
    hasImage.value = true
    mode.value = 'adjust'
    showCompare.value = true
    compare.value = 0.52
    await nextTick()
    await rerender(true)
    showToast('Фото загружено · можно жать «Красиво»')
  } catch {
    error.value = 'Не удалось прочитать файл'
  } finally {
    busy.value = false
    if (e.target) e.target.value = ''
  }
}

function scheduleRerender() {
  clearTimeout(rerenderTimer)
  rerenderTimer = window.setTimeout(() => rerender(false), 60)
}

async function rerender(force) {
  if (!working || !viewCanvas.value) return
  const epoch = ++rerenderEpoch
  if (force) busy.value = true
  try {
    await new Promise((r) => requestAnimationFrame(r))
    if (epoch !== rerenderEpoch) return
    const out = applyPipeline(working, {
      smooth: smooth.value,
      blurPx: blurPx.value,
      brightness: brightness.value,
      contrast: contrast.value,
      warmth: warmth.value,
    })
    if (epoch !== rerenderEpoch) return
    painted = document.createElement('canvas')
    painted.width = out.width
    painted.height = out.height
    painted.getContext('2d').drawImage(out, 0, 0)
    drawView()
  } finally {
    if (force || epoch === rerenderEpoch) busy.value = false
  }
}

function drawView() {
  const canvas = viewCanvas.value
  if (!canvas || !source || !painted) return
  const ctx = canvas.getContext('2d')
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width
    canvas.height = source.height
  }

  if (peekOriginal.value) {
    ctx.drawImage(source, 0, 0)
    drawBadge(ctx, 'ДО', 12, 28)
    return
  }

  ctx.drawImage(painted, 0, 0)

  if (showCompare.value) {
    const split = Math.floor(source.width * compare.value)
    ctx.drawImage(source, 0, 0, split, source.height, 0, 0, split, source.height)
    // divider
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(split - 1, 0, 2, source.height)
    ctx.beginPath()
    ctx.arc(split, source.height / 2, 14, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${Math.max(12, Math.round(source.width * 0.018))}px Outfit, sans-serif`
    ctx.fillText('❮❯', split - 10, source.height / 2 + 5)
    drawBadge(ctx, 'ДО', 12, 28)
    drawBadge(ctx, 'ПОСЛЕ', source.width - 86, 28)
  }
}

function drawBadge(ctx, text, x, y) {
  ctx.save()
  ctx.font = `600 ${Math.max(11, Math.round((source?.width || 800) * 0.016))}px Space Mono, monospace`
  const pad = 8
  const w = ctx.measureText(text).width + pad * 2
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y - 16, w, 24, 8)
    ctx.fill()
  } else {
    ctx.fillRect(x, y - 16, w, 24)
  }
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x + pad, y)
  ctx.restore()
}

watch([smooth, brightness, contrast, warmth], () => {
  if (hasImage.value) scheduleRerender()
})
watch([compare, showCompare, peekOriginal], drawView)
watch(mode, () => {
  if (mode.value === 'heal') showToast('Води пальцем/мышью по прыщам')
})

function canvasPos(ev) {
  const canvas = viewCanvas.value
  const rect = canvas.getBoundingClientRect()
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height
  return { x, y }
}

function nearSplit(ev) {
  if (!showCompare.value || !source) return false
  const { x } = canvasPos(ev)
  return Math.abs(x - source.width * compare.value) < source.width * 0.04
}

function pushUndo() {
  if (!working) return
  const ctx = working.getContext('2d', { willReadFrequently: true })
  undoStack.push(ctx.getImageData(0, 0, working.width, working.height))
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  undoCount.value = undoStack.length
}

function undoHeal() {
  if (!undoStack.length || !working) return
  const data = undoStack.pop()
  undoCount.value = undoStack.length
  working.getContext('2d').putImageData(data, 0, 0)
  rerender(true)
  showToast('Отменено')
}

function onPointerDown(ev) {
  if (!hasImage.value) return
  // compare drag takes priority when near divider
  if (showCompare.value && mode.value !== 'heal' && nearSplit(ev)) {
    dragCompare = true
    viewCanvas.value.setPointerCapture?.(ev.pointerId)
    moveCompare(ev)
    return
  }
  if (mode.value === 'heal') {
    dragHeal = true
    pushUndo()
    viewCanvas.value.setPointerCapture?.(ev.pointerId)
    applyHeal(ev, false)
  } else if (showCompare.value) {
    dragCompare = true
    viewCanvas.value.setPointerCapture?.(ev.pointerId)
    moveCompare(ev)
  }
}

function onPointerMove(ev) {
  if (dragCompare) {
    moveCompare(ev)
    return
  }
  if (dragHeal) applyHeal(ev, true)
}

function onPointerUp() {
  if (dragHeal) {
    dragHeal = false
    rerender(true)
  }
  dragCompare = false
}

function moveCompare(ev) {
  if (!source) return
  const { x } = canvasPos(ev)
  compare.value = Math.min(0.95, Math.max(0.05, x / source.width))
}

function applyHeal(ev, throttled) {
  if (!working) return
  const { x, y } = canvasPos(ev)
  healDab(working, x, y, brush.value, 0.72)
  if (throttled) scheduleRerender()
  else rerender(false)
}

function beautify() {
  smooth.value = 0.55
  brightness.value = 6
  contrast.value = 8
  warmth.value = 10
  mode.value = 'heal'
  showCompare.value = true
  showToast('База готова — кистью добей прыщи')
}

function resetAll() {
  if (!source || !working) return
  working.getContext('2d').drawImage(source, 0, 0)
  undoStack.length = 0
  undoCount.value = 0
  smooth.value = 0
  brightness.value = 0
  contrast.value = 0
  warmth.value = 0
  mode.value = 'adjust'
  rerender(true)
  showToast('Сброшено к оригиналу')
}

function download() {
  if (!painted) return
  const a = document.createElement('a')
  const base = (fileName.value || 'photo').replace(/\.[^.]+$/, '')
  a.href = painted.toDataURL('image/jpeg', 0.92)
  a.download = `${base}-retouched.jpg`
  a.click()
  showToast('Скачивание…')
}

function onDrop(e) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  loadFile(f)
}

function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
  if (!item) return
  const f = item.getAsFile()
  loadFile(f)
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  clearTimeout(toastTimer)
  clearTimeout(rerenderTimer)
  source = working = painted = null
})
</script>

<template>
  <nav class="demo-nav">
    <a class="demo-nav-link" href="/">← Портфолио</a>
    <span class="demo-nav-title">Photo Retouch</span>
  </nav>

  <div class="page">
    <header class="demo-header">
      <span class="demo-label">Live demo · только в браузере</span>
      <h1 class="demo-title">Ретушь селфи</h1>
      <p class="demo-subtitle">
        Сгладь кожу и убери прыщи. Фото никуда не отправляется.
      </p>
    </header>

    <div class="lab-mission">
      <div class="lab-mission-head">
        <div>
          <span class="lab-mission-kicker">Сейчас</span>
          <p class="lab-mission-title">{{ stepHint }}</p>
        </div>
        <span v-if="hasImage" class="pill mono">{{ fileName }}</span>
      </div>
      <ol v-if="!hasImage" class="steps">
        <li>Загрузи или вставь (Ctrl+V) фото</li>
        <li>Жми «Красиво» — база за секунду</li>
        <li>Кистью пройди по прыщам → Скачать</li>
      </ol>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <div class="layout">
      <section
        ref="stageRef"
        class="stage cyber-panel"
        :class="{ dragging }"
      >
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept="image/*"
          @change="onFile"
        />

        <div
          v-if="!hasImage"
          class="drop"
          @click="pickFile"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <p class="drop-title">Кинь фото сюда</p>
          <p class="muted">JPG / PNG / WEBP · или Ctrl+V</p>
          <button type="button" class="btn btn-primary" @click.stop="pickFile">Выбрать файл</button>
        </div>

        <div v-else class="canvas-wrap">
          <canvas
            ref="viewCanvas"
            class="view"
            :class="{ heal: mode === 'heal', grab: showCompare && mode !== 'heal' }"
            @pointerdown.prevent="onPointerDown"
            @pointermove.prevent="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          />
          <div class="overlay-bar">
            <span v-if="busy" class="chip">обрабатываю…</span>
            <span v-else-if="mode === 'heal'" class="chip">кисть · тяни по прыщам</span>
            <span v-else-if="showCompare" class="chip">тяни полоску ДО / ПОСЛЕ</span>
            <button
              type="button"
              class="chip btn-chip"
              @pointerdown.prevent="peekOriginal = true"
              @pointerup.prevent="peekOriginal = false"
              @pointerleave="peekOriginal = false"
            >
              Зажми: оригинал
            </button>
          </div>
        </div>
      </section>

      <aside class="controls cyber-panel">
        <div class="row-btns">
          <button type="button" class="btn btn-primary" @click="pickFile">
            {{ hasImage ? 'Другое фото' : 'Загрузить' }}
          </button>
          <button type="button" class="btn btn-accent" :disabled="!hasImage" @click="beautify">
            Красиво
          </button>
          <button type="button" class="btn btn-outline" :disabled="!hasImage" @click="download">
            Скачать
          </button>
        </div>

        <div class="seg">
          <button type="button" :class="{ on: mode === 'adjust' }" @click="mode = 'adjust'">Тон</button>
          <button type="button" :class="{ on: mode === 'heal' }" :disabled="!hasImage" @click="mode = 'heal'">Кисть</button>
        </div>

        <template v-if="mode === 'adjust'">
          <label class="ctl">
            <span>Кожа мягче <b>{{ Math.round(smooth * 100) }}%</b></span>
            <input v-model.number="smooth" type="range" min="0" max="0.85" step="0.01" :disabled="!hasImage" />
          </label>
          <label class="ctl">
            <span>Яркость <b>{{ brightness }}</b></span>
            <input v-model.number="brightness" type="range" min="-30" max="30" step="1" :disabled="!hasImage" />
          </label>
          <label class="ctl">
            <span>Контраст <b>{{ contrast }}</b></span>
            <input v-model.number="contrast" type="range" min="-30" max="40" step="1" :disabled="!hasImage" />
          </label>
          <label class="ctl">
            <span>Теплота <b>{{ warmth }}</b></span>
            <input v-model.number="warmth" type="range" min="-20" max="30" step="1" :disabled="!hasImage" />
          </label>
          <label class="check">
            <input v-model="showCompare" type="checkbox" :disabled="!hasImage" />
            Сравнение на фото
          </label>
        </template>

        <template v-else>
          <label class="ctl">
            <span>Размер кисти <b>{{ brush }}px</b></span>
            <input v-model.number="brush" type="range" min="10" max="90" step="1" />
          </label>
          <p class="tip muted">Короткие мазки по прыщу. Если перебор — «Отменить».</p>
          <div class="row-btns">
            <button type="button" class="btn btn-outline" :disabled="!undoCount" @click="undoHeal">
              Отменить ({{ undoCount }})
            </button>
          </div>
        </template>

        <button type="button" class="btn btn-ghost wide" :disabled="!hasImage" @click="resetAll">
          Сбросить всё
        </button>

        <p class="fine muted">
          Демо-фильтр, не нейросеть. Для жирных прыщей: «Красиво» → кисть точечно.
        </p>
      </aside>
    </div>
  </div>

  <div v-if="hasImage" class="mobile-bar">
    <button type="button" class="btn btn-accent" @click="beautify">Красиво</button>
    <button type="button" class="btn btn-outline" :class="{ on: mode === 'heal' }" @click="mode = 'heal'">Кисть</button>
    <button type="button" class="btn btn-primary" @click="download">Скачать</button>
  </div>

  <div v-if="toast" class="toast" role="status">{{ toast }}</div>
</template>

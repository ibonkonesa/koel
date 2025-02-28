<template>
  <div id="equalizer" data-testid="equalizer" ref="root">
    <div class="presets">
      <label class="select-wrapper">
        <select v-model="selectedPresetId" title="Select equalizer">
          <option disabled value="-1">Preset</option>
          <option v-for="preset in presets" :value="preset.id" :key="preset.id" v-once>{{ preset.name }}</option>
        </select>
        <icon :icon="faAngleDown" class="arrow text-highlight" size="sm"/>
      </label>
    </div>
    <div class="bands">
      <span class="band preamp">
        <span class="slider"></span>
        <label>Preamp</label>
      </span>

      <span class="indicators">
        <span>+20</span>
        <span>0</span>
        <span>-20</span>
      </span>

      <span class="band amp" v-for="band in bands" :key="band.label">
        <span class="slider"></span>
        <label>{{ band.label }}</label>
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import noUiSlider from 'nouislider'
import { faAngleDown } from '@fortawesome/free-solid-svg-icons'
import { nextTick, onMounted, ref, watch } from 'vue'
import { eventBus } from '@/utils'
import { equalizerStore, preferenceStore as preferences } from '@/stores'
import { audioService as audioService } from '@/services'

interface Band {
  label: string
  filter: BiquadFilterNode
}

let context!: AudioContext
let preampGainNode!: GainNode

const root = ref<HTMLElement>()
const bands = ref<Band[]>([])
const preampGainValue = ref(0)
const selectedPresetId = ref(-1)

const presets: EqualizerPreset[] = Object.assign([], equalizerStore.presets)

const changePreampGain = (dbValue: number) => {
  preampGainValue.value = dbValue
  preampGainNode.gain.setTargetAtTime(Math.pow(10, dbValue / 20), context.currentTime, 0.01)
}

const changeFilterGain = (filter: BiquadFilterNode, value: number) => {
  filter.gain.setTargetAtTime(value, context.currentTime, 0.01)
}

const createSliders = () => {
  const config = equalizerStore.get()!

  root.value?.querySelectorAll<SliderElement>('.slider').forEach((el, i) => {
    el.noUiSlider?.destroy()

    noUiSlider.create(el, {
      connect: [false, true],
      // the first element is the preamp. The rest are gains.
      start: i === 0 ? config.preamp : config.gains[i - 1],
      range: { min: -20, max: 20 },
      orientation: 'vertical',
      direction: 'rtl'
    })

    if (!el.noUiSlider) {
      throw new Error(`Failed to initialize slider on element ${i}`)
    }

    el.noUiSlider.on('slide', (values, handle) => {
      if (el.parentElement!.matches('.preamp')) {
        changePreampGain(values[handle])
      } else {
        changeFilterGain(bands.value[i - 1].filter, values[handle])
      }
    })

    el.noUiSlider.on('change', () => {
      // User has customized the equalizer. No preset should be selected.
      selectedPresetId.value = -1
      save()
    })
  })

  // Now we set this value to trigger the audio processing.
  selectedPresetId.value = preferences.selectedPreset
}

const init = async () => {
  const config = equalizerStore.get()!

  context = audioService.getContext()
  preampGainNode = context.createGain()
  changePreampGain(config.preamp)

  const source = audioService.getSource()
  source.connect(preampGainNode)

  let prevFilter: BiquadFilterNode

  // Create 10 bands with the frequencies similar to those of Winamp and connect them together.
  const frequencies = [60, 170, 310, 600, 1_000, 3_000, 6_000, 12_000, 14_000, 16_000]

  frequencies.forEach((frequency, i) => {
    const filter = context.createBiquadFilter()

    if (i === 0) {
      filter.type = 'lowshelf'
    } else if (i === 9) {
      filter.type = 'highshelf'
    } else {
      filter.type = 'peaking'
    }

    filter.gain.setTargetAtTime(0, context.currentTime, 0.01)
    filter.Q.setTargetAtTime(1, context.currentTime, 0.01)
    filter.frequency.setTargetAtTime(frequency, context.currentTime, 0.01)

    prevFilter ? prevFilter.connect(filter) : preampGainNode.connect(filter)
    prevFilter = filter

    bands.value.push({
      filter,
      label: String(frequency).replace('000', 'K')
    })
  })

  prevFilter!.connect(context.destination)

  await nextTick()
  createSliders()
}

const save = () => equalizerStore.set(preampGainValue.value, bands.value.map(band => band.filter.gain.value))

const loadPreset = (preset: EqualizerPreset) => {
  root.value?.querySelectorAll<SliderElement>('.slider').forEach((el, i) => {
    if (!el.noUiSlider) {
      throw new Error('Preset can only be loaded after sliders have been set up')
    }

    // We treat our preamp slider differently.
    if (el.parentElement!.matches('.preamp')) {
      changePreampGain(preset.preamp)
      // Update the slider values into GUI.
      el.noUiSlider.set(preset.preamp)
    } else {
      changeFilterGain(bands.value[i - 1].filter, preset.gains[i - 1])
      // Update the slider values into GUI.
      el.noUiSlider.set(preset.gains[i - 1])
    }
  })

  save()
}

watch(selectedPresetId, () => {
  preferences.selectedPreset = selectedPresetId.value
  selectedPresetId.value !== -1 && loadPreset(equalizerStore.getPresetById(selectedPresetId.value)!)
})

onMounted(() => eventBus.on('INIT_EQUALIZER', () => init()))
</script>

<style lang="scss">
#equalizer {
  user-select: none;
  position: absolute;
  bottom: var(--footer-height);
  width: 100%;
  background: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  left: 0;
  box-shadow: 0 0 50x 0 var(--color-bg-primary);

  label {
    margin-top: 8px;
    margin-bottom: 0;
    text-align: left;
  }

  .presets {
    padding: 8px 16px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    flex: 1;
    align-content: center;
    z-index: 1;
    border-bottom: 1px solid rgba(255, 255, 255, .1);

    .select-wrapper {
      position: relative;
      margin-bottom: 0;

      .arrow {
        margin-left: -14px;
        pointer-events: none;
      }
    }

    select {
      background: none;
      color: var(--color-text-primary);
      padding-left: 0;
      width: 100px;
      text-transform: none;

      option {
        color: var(--color-black);
      }
    }
  }

  .bands {
    padding: 16px;
    z-index: 1;
    left: 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    label, .indicators {
      font-size: .8rem;
    }

    .band {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .slider {
      height: 100px;
    }

    .indicators {
      height: 100px;
      width: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      margin-left: -16px;
      opacity: 0;
      transition: .4s;

      span:first-child {
        line-height: 8px;
      }

      span:last-child {
        line-height: 8px;
      }
    }

    &:hover .indicators {
      opacity: 1;
    }
  }

  .noUi {
    &-connect {
      background: none;
      box-shadow: none;

      &::after {
        content: " ";
        position: absolute;
        width: 2px;
        height: 100%;
        top: 0;
        left: 7px;
      }
    }

    &-touch-area {
      cursor: ns-resize;
    }

    &-target {
      background: transparent;
      border-radius: 0;
      border: 0;
      box-shadow: none;
      width: 16px;

      &::after {
        content: " ";
        position: absolute;
        width: 2px;
        height: 100%;
        background: linear-gradient(to bottom, var(--color-highlight) 0%, var(--color-highlight) 36%, var(--color-green) 100%);
        background-size: 2px;
        top: 0;
        left: 7px;
      }
    }

    &-handle {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      cursor: pointer;

      &::before, &::after {
        display: none;
      }
    }

    &-vertical {
      .noUi-handle {
        width: 16px;
        height: 2px;
        left: -16px;
        top: 0;
      }
    }
  }

  @media only screen and (max-width: 768px) {
    position: fixed;
    max-width: 414px;
    left: auto;
    right: 0;
    bottom: var(--footer-height);
    display: block;
    height: auto;

    label {
      line-height: 20px;
    }
  }
}
</style>

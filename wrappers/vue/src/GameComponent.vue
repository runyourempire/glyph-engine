<template>
  <div ref="containerRef" :class="className" :style="containerStyle">
    <component :is="tag" ref="glyphRef" style="width: 100%; height: 100%" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, CSSProperties } from 'vue';

interface Props {
  tag: string;
  src: string;
  params?: Record<string, number>;
  className?: string;
  style?: CSSProperties;
}

const props = withDefaults(defineProps<Props>(), {
  params: () => ({}),
});

const emit = defineEmits<{
  ready: [element: HTMLElement];
}>();

const containerRef = ref<HTMLDivElement>();
const glyphRef = ref<HTMLElement>();

const containerStyle = computed<CSSProperties>(() => ({
  width: '100%',
  height: '100%',
  ...props.style,
}));

onMounted(() => {
  // Load component script
  const existing = document.querySelector(`script[data-glyph-src="${props.src}"]`);
  if (!existing) {
    const script = document.createElement('script');
    script.src = props.src;
    script.dataset.glyphSrc = props.src;
    document.head.appendChild(script);
  }

  if (glyphRef.value) {
    customElements.whenDefined(props.tag).then(() => {
      emit('ready', glyphRef.value!);
    });
  }
});

// Watch params
watch(
  () => props.params,
  (params) => {
    const el = glyphRef.value as any;
    if (!el?.setParam) return;
    for (const [name, value] of Object.entries(params || {})) {
      el.setParam(name, value);
    }
  },
  { deep: true }
);

// Expose methods
function setParam(name: string, value: number) {
  (glyphRef.value as any)?.setParam(name, value);
}

function getFrame(): ImageData | null {
  return (glyphRef.value as any)?.getFrame?.() ?? null;
}

function getFrameDataURL(type?: string): string | null {
  return (glyphRef.value as any)?.getFrameDataURL?.(type) ?? null;
}

defineExpose({ setParam, getFrame, getFrameDataURL, element: glyphRef });
</script>

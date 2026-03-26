import { ref, onUnmounted } from 'vue';
import { TOAST_DURATION_MS } from '@shared/logic';

const toastMessage = ref('');
const toastVisible = ref(false);
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  onUnmounted(() => {
    toastVisible.value = false;
    toastMessage.value = '';
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
  });

  function show(message: string) {
    toastMessage.value = message;
    toastVisible.value = true;

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastVisible.value = false;
    }, TOAST_DURATION_MS);
  }

  return {
    message: toastMessage,
    visible: toastVisible,
    show,
  };
}

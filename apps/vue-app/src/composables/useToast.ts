import { ref } from 'vue';

const toastMessage = ref('');
const toastVisible = ref(false);
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  function show(message: string) {
    toastMessage.value = message;
    toastVisible.value = true;

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastVisible.value = false;
    }, 3000);
  }

  return {
    message: toastMessage,
    visible: toastVisible,
    show,
  };
}

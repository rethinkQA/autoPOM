class ToastStore {
  message = $state('');
  visible = $state(false);
  #timer: ReturnType<typeof setTimeout> | null = null;

  show(msg: string) {
    if (this.#timer) clearTimeout(this.#timer);
    this.message = msg;
    this.visible = true;
    this.#timer = setTimeout(() => {
      this.visible = false;
      this.#timer = null;
    }, 3000);
  }
}

export const toastStore = new ToastStore();

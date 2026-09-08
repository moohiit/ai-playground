/**
 * In-app replacement for React Native's Alert.
 *
 * Alert.alert draws the platform dialog: a white system box over a dark app.
 * This keeps Alert's call shape — title, message, buttons — so every call
 * site is a rename, and the dialog is drawn in the app's own style by
 * <AppDialog />, mounted once in the root layout. Dialogs queue: one raised
 * while another is open shows after it, as Alert would.
 */
export type DialogButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};

export type DialogSpec = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
};

type Listener = (queue: DialogSpec[]) => void;

let queue: DialogSpec[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(queue);
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  // Alert.alert takes a fourth options argument; accepted so no call site
  // needs to change, ignored because the host handles dismissal itself.
  _options?: unknown
) {
  queue = [
    ...queue,
    {
      id: ++seq,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
    },
  ];
  emit();
}

export function dismissDialog(id: number) {
  queue = queue.filter((d) => d.id !== id);
  emit();
}

export function subscribeDialogs(listener: Listener) {
  listeners.add(listener);
  listener(queue);
  return () => {
    listeners.delete(listener);
  };
}

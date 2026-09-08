import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  dismissDialog,
  subscribeDialogs,
  type DialogButton,
  type DialogSpec,
} from "../lib/dialog";

const BUTTON_TEXT: Record<NonNullable<DialogButton["style"]>, string> = {
  default: "text-brand-300",
  cancel: "text-zinc-400",
  destructive: "text-red-400",
};

/**
 * The one dialog surface for the app — see lib/dialog.ts. Shows the head of
 * the queue; the next one appears as soon as this is dismissed.
 */
export function AppDialog() {
  const [queue, setQueue] = useState<DialogSpec[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);

  const current = queue[0];
  if (!current) return null;

  // Dismiss first, then run the handler — Alert's order, and it means a
  // handler that raises another dialog does not see this one still open.
  const press = (button: DialogButton) => {
    dismissDialog(current.id);
    void button.onPress?.();
  };

  // Hardware back and the backdrop act as the cancel button when there is
  // one, so a confirm flow's "no" path runs; otherwise they just close.
  const cancel = () => {
    const cancelButton = current.buttons.find((b) => b.style === "cancel");
    if (cancelButton) press(cancelButton);
    else dismissDialog(current.id);
  };

  // Two buttons sit in a row; three or more stack, as the platform does.
  const stacked = current.buttons.length > 2;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancel}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/60 px-8"
        onPress={cancel}
        accessibilityRole="none"
      >
        <Pressable
          className="w-full max-w-[360px] rounded-2xl border border-white/10 bg-zinc-950 p-5"
          onPress={() => undefined}
          accessibilityViewIsModal
        >
          <Text className="text-base font-bold text-zinc-100">{current.title}</Text>
          {current.message ? (
            <ScrollView style={{ maxHeight: 320 }} className="mt-2">
              <Text className="text-sm leading-5 text-zinc-300">{current.message}</Text>
            </ScrollView>
          ) : null}
          <View className={stacked ? "mt-5 items-end gap-1" : "mt-5 flex-row justify-end gap-2"}>
            {current.buttons.map((button, i) => (
              <Pressable
                key={`${i}-${button.text}`}
                onPress={() => press(button)}
                hitSlop={6}
                className="rounded-xl px-3 py-2"
                accessibilityRole="button"
              >
                <Text
                  className={`text-sm font-semibold ${BUTTON_TEXT[button.style ?? "default"]}`}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

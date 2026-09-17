import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import type { Group, KnownPerson, Member } from "../lib/types";
import { Input } from "./ui";

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-[12px] uppercase tracking-wider text-zinc-500">
      {children}
    </Text>
  );
}

/**
 * Bottom sheet holding everything about a group that is not day-to-day
 * spending: name, members, notifications, the public link and deletion.
 * State and network handlers stay in the group screen — this only draws them.
 */
export function GroupSettingsSheet({
  visible,
  onClose,
  group,
  userId,
  creatorName,
  onRename,
  removingMemberId,
  onRemoveMember,
  newMember,
  onChangeNewMember,
  memberFocused,
  onMemberFocusChange,
  suggestions,
  addingMember,
  onAddMember,
  newGuest,
  onChangeNewGuest,
  addingGuest,
  onAddGuest,
  muted,
  muting,
  onToggleMute,
  shareId,
  sharing,
  onShare,
  onStopSharing,
  onDeleteGroup,
  deleteRequestBusy,
  onRequestDelete,
  onWithdrawDeleteRequest,
  onDismissDeleteRequests,
}: {
  visible: boolean;
  onClose: () => void;
  group: Group | null;
  userId?: string;
  creatorName: string;
  onRename: () => void;
  removingMemberId: string | null;
  onRemoveMember: (m: Member) => void;
  newMember: string;
  onChangeNewMember: (value: string) => void;
  memberFocused: boolean;
  onMemberFocusChange: (focused: boolean) => void;
  suggestions: KnownPerson[];
  addingMember: boolean;
  onAddMember: () => void;
  newGuest: string;
  onChangeNewGuest: (value: string) => void;
  addingGuest: boolean;
  onAddGuest: () => void;
  muted: boolean;
  muting: boolean;
  onToggleMute: () => void;
  shareId: string | null;
  sharing: boolean;
  onShare: () => void;
  onStopSharing: () => void;
  onDeleteGroup: () => void;
  deleteRequestBusy: boolean;
  onRequestDelete: () => void;
  onWithdrawDeleteRequest: () => void;
  onDismissDeleteRequests: () => void;
}) {
  const isCreator = !!userId && userId === group?.createdBy;
  const deleteRequests = group?.deleteRequests ?? [];
  const iRequested = deleteRequests.some((r) => r.userId === userId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            style={{ flex: 1 }}
            onPress={onClose}
            accessibilityLabel="Close group settings"
          />
          <View
            className="rounded-t-3xl border-t border-white/10 bg-zinc-950 px-5 pb-10 pt-5"
            style={{ maxHeight: "88%" }}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-base font-bold text-zinc-100">
                Group settings
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text className="text-sm font-semibold text-brand-400">Done</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 20, paddingBottom: 8 }}
            >
              {/* Group name */}
              <View>
                <SectionTitle>Group name</SectionTitle>
                <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                  <Text className="flex-1 text-sm text-zinc-100" numberOfLines={1}>
                    {group?.name ?? "Group"}
                  </Text>
                  {isCreator && (
                    <Pressable onPress={onRename} hitSlop={8} accessibilityRole="button">
                      <Text className="text-xs font-semibold text-brand-400">
                        Rename
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Members */}
              <View>
                <SectionTitle>Members</SectionTitle>
                <View className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
                  {group?.members.map((m, i) => {
                    const canRemove =
                      userId === group.createdBy &&
                      m.isActive &&
                      m.userId !== group.createdBy;
                    return (
                      <View
                        key={m.userId}
                        className={`flex-row items-center gap-2 px-4 py-2.5 ${
                          i > 0 ? "border-t border-white/5" : ""
                        } ${m.isActive ? "" : "opacity-60"}`}
                      >
                        <Text className="shrink text-sm text-zinc-200" numberOfLines={1}>
                          {m.name}
                          {m.userId === userId ? " (you)" : ""}
                        </Text>
                        {m.userId === group.createdBy && (
                          <Text className="rounded-full border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[9px] uppercase text-brand-300">
                            creator
                          </Text>
                        )}
                        {m.isGuest && (
                          <Text className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[9px] uppercase text-zinc-400">
                            guest
                          </Text>
                        )}
                        {!m.isActive && (
                          <Text className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase text-amber-400">
                            left
                          </Text>
                        )}
                        {canRemove && (
                          <Pressable
                            onPress={() => onRemoveMember(m)}
                            hitSlop={8}
                            disabled={removingMemberId !== null}
                            className="ml-auto"
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${m.name}`}
                          >
                            <Text className="text-sm text-zinc-500">
                              {removingMemberId === m.userId ? "…" : "✕"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>

                <View className="mt-3 flex-row gap-2">
                  <Input
                    value={newMember}
                    onChangeText={onChangeNewMember}
                    onFocus={() => onMemberFocusChange(true)}
                    // Delayed so a tap on a suggestion lands before the list
                    // unmounts — otherwise the blur removes it mid-press.
                    onBlur={() => setTimeout(() => onMemberFocusChange(false), 150)}
                    placeholder="Invite member by email"
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
                  />
                  <Pressable
                    onPress={onAddMember}
                    disabled={addingMember || !newMember.trim()}
                    className={`items-center justify-center rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 ${
                      addingMember || !newMember.trim() ? "opacity-50" : ""
                    }`}
                  >
                    <Text className="text-xs font-semibold text-brand-400">
                      {addingMember ? "…" : "Add"}
                    </Text>
                  </Pressable>
                </View>

                {/* Suggestions narrow as you type, so the field still accepts
                    an address nobody in your groups has. */}
                {memberFocused && suggestions.length > 0 && (
                  <View className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
                    {suggestions.map((p, i) => (
                      <Pressable
                        key={p.userId}
                        onPress={() => {
                          onChangeNewMember(p.email);
                          onMemberFocusChange(false);
                        }}
                        className={`flex-row items-center justify-between px-3 py-2.5 ${
                          i > 0 ? "border-t border-white/5" : ""
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="text-[13px] text-zinc-200">{p.name}</Text>
                          <Text className="text-[11px] text-zinc-500" numberOfLines={1}>
                            {p.email}
                          </Text>
                        </View>
                        <Text className="text-[11px] text-zinc-600">
                          {p.sharedGroups} shared
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View className="mt-2 flex-row gap-2">
                  <Input
                    value={newGuest}
                    onChangeText={onChangeNewGuest}
                    placeholder="Add a guest by name (no account)"
                    placeholderTextColor="#71717a"
                    className="flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
                  />
                  <Pressable
                    onPress={onAddGuest}
                    disabled={addingGuest || !newGuest.trim()}
                    className={`items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 ${
                      addingGuest || !newGuest.trim() ? "opacity-50" : ""
                    }`}
                  >
                    <Text className="text-xs font-semibold text-zinc-300">
                      {addingGuest ? "…" : "Guest"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Notifications */}
              <View>
                <SectionTitle>Notifications</SectionTitle>
                <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-2.5">
                  <View className="flex-1">
                    <Text className="text-sm text-zinc-100">Mute this group</Text>
                    <Text className="mt-0.5 text-[11px] text-zinc-500">
                      {muted
                        ? "You won't be notified about this group."
                        : "Notifications for this group are on."}
                    </Text>
                  </View>
                  <Switch
                    value={muted}
                    onValueChange={() => onToggleMute()}
                    disabled={muting}
                    trackColor={{ false: "#3f3f46", true: "#6366f1" }}
                    thumbColor="#f4f4f5"
                    accessibilityLabel="Mute this group"
                  />
                </View>
              </View>

              {/* Share link. Creating and revoking the public link is
                  creator-only on the server, so offering it to every member
                  only produced a refusal they could not act on. Members can
                  still open an existing link. */}
              {(isCreator || shareId) && (
                <View>
                  <SectionTitle>Share link</SectionTitle>
                  <Pressable
                    onPress={onShare}
                    disabled={sharing}
                    className="items-center rounded-xl border border-brand-500/30 bg-brand-500/10 py-3"
                  >
                    <Text className="text-sm font-medium text-white">
                      {shareId ? "🔗 Share split link" : "Share split (create link)"}
                    </Text>
                  </Pressable>
                  {shareId && isCreator && (
                    <Pressable onPress={onStopSharing} className="mt-1 items-center py-1">
                      <Text className="text-[11px] text-zinc-500">
                        Turn off public link
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Danger zone */}
              <View>
                <SectionTitle>Danger zone</SectionTitle>
                {isCreator ? (
                  <View className="gap-2">
                    {deleteRequests.length > 0 && (
                      <View className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                        <Text className="text-[13px] leading-5 text-amber-300">
                          {joinNames(deleteRequests.map((r) => r.name))} asked you
                          to delete this group
                        </Text>
                        <Pressable
                          onPress={onDismissDeleteRequests}
                          disabled={deleteRequestBusy}
                          hitSlop={8}
                          className={`mt-1.5 self-start ${
                            deleteRequestBusy ? "opacity-50" : ""
                          }`}
                          accessibilityRole="button"
                        >
                          <Text className="text-xs font-semibold text-zinc-400">
                            {deleteRequestBusy ? "…" : "Dismiss requests"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    <Pressable
                      onPress={onDeleteGroup}
                      className="items-center rounded-xl border border-red-500/30 bg-red-500/5 py-3"
                      accessibilityRole="button"
                    >
                      <Text className="text-sm font-medium text-red-400">
                        Delete group
                      </Text>
                    </Pressable>
                  </View>
                ) : iRequested ? (
                  <View className="flex-row items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                    <Text className="flex-1 text-sm text-zinc-500">
                      Deletion requested
                    </Text>
                    <Pressable
                      onPress={onWithdrawDeleteRequest}
                      disabled={deleteRequestBusy}
                      hitSlop={8}
                      className={deleteRequestBusy ? "opacity-50" : ""}
                      accessibilityRole="button"
                    >
                      <Text className="text-xs font-semibold text-zinc-300">
                        {deleteRequestBusy ? "…" : "Withdraw"}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable
                      onPress={onRequestDelete}
                      disabled={deleteRequestBusy}
                      className={`items-center rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 ${
                        deleteRequestBusy ? "opacity-50" : ""
                      }`}
                      accessibilityRole="button"
                    >
                      <Text className="text-center text-sm font-medium text-red-400">
                        {deleteRequestBusy
                          ? "Sending…"
                          : `Ask ${creatorName} to delete this group`}
                      </Text>
                    </Pressable>
                    <Text className="mt-1.5 text-center text-[11px] text-zinc-600">
                      Only the person who created a group can delete it.
                    </Text>
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, guildPath, post } from "@/lib/api";

export interface GreetConfig {
  guildId: string;
  hasGuild: boolean;
  guildName: string;
  channels: { id: string; name: string }[];
  config: {
    welcome?: { enabled: boolean; channelId?: string | null; message?: string };
    leave?: { enabled: boolean; channelId?: string | null; message?: string };
    logs?: {
      enabled: boolean;
      channelId?: string | null;
      memberEvents?: boolean;
      messageEvents?: boolean;
      serverEvents?: boolean;
      moderationEvents?: boolean;
      voiceEvents?: boolean;
      inviteEvents?: boolean;
      threadEvents?: boolean;
      bulkMessageEvents?: boolean;
    };
  };
}

export function useGreetConfig(guildId?: string) {
  const queryClient = useQueryClient();
  const query = useQuery<GreetConfig>({
    queryKey: ["greet", guildId],
    queryFn: () => get(guildPath("/api/greet", guildId)),
    enabled: !!guildId,
  });

  const saveMutation = useMutation({
    mutationFn: (body: unknown) => post(guildPath("/api/greet", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["greet", guildId] });
    },
  });

  return { ...query, saveMutation };
}

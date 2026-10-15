"use client";

import { useCallback, useState } from "react";
import { interpolate } from "@/shared/lib/format";
import { copy } from "@/shared/copy/es";
import type { ManagedRole } from "../domain/team";
import type { GrantRoleAction, RevokeRoleAction } from "./actions";

export type TeamNotice =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

export type TeamActionStatus = "idle" | "granting" | "revoking";

/**
 * Runs the team server actions and turns each outcome into a message. `onChanged` runs after a
 * successful change (the screen refreshes its list there). Only one change runs at a time.
 */
export function useTeamActions(grant: GrantRoleAction, revoke: RevokeRoleAction, onChanged: () => void) {
  const [status, setStatus] = useState<TeamActionStatus>("idle");
  const [notice, setNotice] = useState<TeamNotice>(null);

  const grantRole = useCallback(
    async (email: string, role: ManagedRole): Promise<boolean> => {
      setStatus("granting");
      setNotice(null);
      const result = await grant({ email, role });
      setStatus("idle");

      if (!result.ok) {
        setNotice({ kind: "error", text: copy.admin.team.errors[result.code] });
        return false;
      }
      setNotice({
        kind: "success",
        text: interpolate(copy.admin.team.granted, { email, role: copy.admin.team.roles[role] }),
      });
      onChanged();
      return true;
    },
    [grant, onChanged],
  );

  const revokeRole = useCallback(
    async (email: string): Promise<boolean> => {
      setStatus("revoking");
      setNotice(null);
      const result = await revoke({ email });
      setStatus("idle");

      if (!result.ok) {
        setNotice({ kind: "error", text: copy.admin.team.errors[result.code] });
        return false;
      }
      setNotice({ kind: "success", text: interpolate(copy.admin.team.revoked, { email }) });
      onChanged();
      return true;
    },
    [revoke, onChanged],
  );

  return { status, notice, grantRole, revokeRole, clearNotice: () => setNotice(null) };
}

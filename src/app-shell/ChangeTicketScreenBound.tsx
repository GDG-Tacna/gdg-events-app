"use client";

import { changeCadetTicketAction, lookupTicketAction, searchTicketCadetsAction } from "@/app-shell/tickets/tickets.actions";
import { QrCodeCamera } from "@/features/scanner";
import { ChangeTicketScreen } from "@/features/tickets";
import { ROUTES } from "@/shared/config/routes";

/**
 * The «Cambiar entrada» screen bound to the real camera and the real server actions. It lives in the app shell for the
 * same reason the serve screen does: it is the one place that knows both the camera and the actions.
 */
export function ChangeTicketScreenBound() {
  return <ChangeTicketScreen camera={QrCodeCamera} lookup={lookupTicketAction} search={searchTicketCadetsAction} change={changeCadetTicketAction} backHref={ROUTES.staff} />;
}

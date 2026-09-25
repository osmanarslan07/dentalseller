"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Driver, TransferCompany, TransferDefaults } from "@/types";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  deleteDriver,
  deleteTransferCompany,
  saveDriver,
  saveTransferCompany,
  saveTransferDefaults,
  setDriverActive,
  setTransferCompanyActive,
} from "./transfer-actions";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n";

/** Runs a server action with the shared toast/refresh/error handling every row here needs. */
function useAction() {
  const router = useRouter();
  const { showToast } = useToast();
  const t = useT();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, success: string, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        showToast(success);
        after?.();
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("Something went wrong"), "error");
      }
    });
  }

  return { pending, run, t };
}

export function TransfersCard({
  companies,
  defaults,
  isAdmin,
}: {
  companies: TransferCompany[];
  defaults: TransferDefaults;
  isAdmin: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const t = useT();

  return (
    <>
      <DefaultsCard companies={companies} defaults={defaults} isAdmin={isAdmin} />
      <Card className="p-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{t("Transfer companies & drivers")}</h2>
          {!adding && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
              + {t("Add company")}
            </Button>
          )}
        </div>
        <p className="mb-5 text-sm text-slate-500">
          {t("Pick a company and driver for each transfer. The clinic's own car and drivers are listed as internal — internal transfers never cost anything. Transfer details are sent to the driver's phone.")}
        </p>

        {adding && (
          <div className="mb-4 rounded-xl border border-slate-200 p-4">
            <CompanyForm onDone={() => setAdding(false)} />
          </div>
        )}

        <div className="space-y-4">
          {companies.map((c) => (
            <CompanyBlock key={c.id} company={c} isAdmin={isAdmin} />
          ))}
        </div>
      </Card>
    </>
  );
}

const companyName = (c: TransferCompany, t: T) => (c.is_internal ? `${c.name} (${t("internal")})` : c.name);

/** One company + driver pair of selects; the driver list follows the chosen company. */
function DefaultPicker({
  kind,
  label,
  hint,
  companies,
  initialCompanyId,
  initialDriverId,
  disabled,
}: {
  kind: "airport" | "local";
  label: string;
  hint: string;
  companies: TransferCompany[];
  initialCompanyId: string | null;
  initialDriverId: string | null;
  disabled: boolean;
}) {
  const t = useT();
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [driverId, setDriverId] = useState(initialDriverId ?? "");
  const company = companies.find((c) => c.id === companyId);
  const activeCompanies = companies.filter((c) => c.is_active || c.id === initialCompanyId);
  const drivers = (company?.drivers ?? []).filter((d) => d.is_active || d.id === initialDriverId);

  return (
    <div>
      <p className="text-sm font-medium text-slate-800">{label}</p>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("Company")}</Label>
          <Select
            name={`${kind}_company_id`}
            value={companyId}
            disabled={disabled}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setDriverId("");
            }}
          >
            <option value="">{t("No default")}</option>
            {activeCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyName(c, t)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("Driver")}</Label>
          <Select
            name={`${kind}_driver_id`}
            value={driverId}
            disabled={disabled || !company}
            onChange={(e) => setDriverId(e.target.value)}
          >
            <option value="">{company ? t("No default driver") : t("Pick a company first")}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.vehicle ? ` · ${d.vehicle}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

function DefaultsCard({
  companies,
  defaults,
  isAdmin,
}: {
  companies: TransferCompany[];
  defaults: TransferDefaults;
  isAdmin: boolean;
}) {
  const { pending, run, t } = useAction();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(() => saveTransferDefaults(formData), t("Defaults saved ✓"));
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t("Defaults")}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {t("“Suggest transfers” and new transfers start with these — you can still change them on each transfer.")}
        {!isAdmin && ` ${t("Only an admin can change them.")}`}
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <DefaultPicker
          kind="airport"
          label={t("Airport transfers")}
          hint={t("Arrival (airport → hotel) and departure (hotel → airport).")}
          companies={companies}
          initialCompanyId={defaults.airportCompanyId}
          initialDriverId={defaults.airportDriverId}
          disabled={!isAdmin}
        />
        <DefaultPicker
          kind="local"
          label={t("Local transfers")}
          hint={t("Hotel ↔ clinic.")}
          companies={companies}
          initialCompanyId={defaults.localCompanyId}
          initialDriverId={defaults.localDriverId}
          disabled={!isAdmin}
        />
        {isAdmin && (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? t("Saving…") : t("Save defaults")}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function CompanyForm({ company, onDone }: { company?: TransferCompany; onDone: () => void }) {
  const { pending, run, t } = useAction();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(() => saveTransferCompany(company?.id ?? null, formData), company ? t("Company saved ✓") : t("Company added ✓"), onDone);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("Company name")}</Label>
          <Input name="name" required defaultValue={company?.name} placeholder="Antalya VIP Transfer" autoFocus />
        </div>
        <div>
          <Label>{t("Phone (dispatch)")}</Label>
          <Input name="phone" type="tel" defaultValue={company?.phone ?? ""} placeholder="+90 5xx xxx xx xx" />
        </div>
      </div>
      <div>
        <Label>{t("Notes")}</Label>
        <Input name="notes" defaultValue={company?.notes ?? ""} placeholder={t("Prices, contact person…")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("Saving…") : company ? t("Save") : t("Add company")}
        </Button>
      </div>
    </form>
  );
}

function CompanyBlock({ company, isAdmin }: { company: TransferCompany; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [addingDriver, setAddingDriver] = useState(false);
  const { pending, run, t } = useAction();

  return (
    <div className={`rounded-xl border border-slate-200 ${company.is_active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        {editing ? (
          <div className="w-full">
            <CompanyForm company={company} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{company.name}</span>
                <Badge tone={company.is_internal ? "blue" : "slate"}>{company.is_internal ? t("Internal") : t("External")}</Badge>
                {!company.is_active && <Badge tone="amber">{t("Inactive")}</Badge>}
              </div>
              {(company.phone || company.notes) && (
                <p className="mt-0.5 text-xs text-slate-500">{[company.phone, company.notes].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
              <button type="button" onClick={() => setEditing(true)} className="text-teal-600 hover:underline">
                {t("Edit")}
              </button>
              {!company.is_internal && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setTransferCompanyActive(company.id, !company.is_active),
                      company.is_active ? t("Company deactivated") : t("Company reactivated")
                    )
                  }
                  className="text-slate-500 hover:underline"
                >
                  {company.is_active ? t("Deactivate") : t("Reactivate")}
                </button>
              )}
              {isAdmin && !company.is_internal && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(t("Delete {name} and its drivers? Deactivating keeps them for past transfers.", { name: company.name }))) return;
                    run(() => deleteTransferCompany(company.id), t("Company deleted"));
                  }}
                  className="text-red-600 hover:underline"
                >
                  {t("Delete")}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-2">
        {company.drivers.length === 0 && !addingDriver && (
          <p className="py-2 text-sm text-slate-400">{t("No drivers yet.")}</p>
        )}
        <ul className="divide-y divide-slate-100">
          {company.drivers.map((d) => (
            <DriverRow key={d.id} driver={d} companyId={company.id} isAdmin={isAdmin} />
          ))}
        </ul>
        {addingDriver ? (
          <div className="my-2 rounded-lg bg-slate-50 p-3">
            <DriverForm companyId={company.id} onDone={() => setAddingDriver(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingDriver(true)}
            className="my-1 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            + {t("Add driver")}
          </button>
        )}
      </div>
    </div>
  );
}

function DriverForm({ driver, companyId, onDone }: { driver?: Driver; companyId: string; onDone: () => void }) {
  const { pending, run, t } = useAction();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(() => saveDriver(driver?.id ?? null, companyId, formData), driver ? t("Driver saved ✓") : t("Driver added ✓"), onDone);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>{t("Name")}</Label>
          <Input name="name" required defaultValue={driver?.name} placeholder="Ahmet Yılmaz" autoFocus />
        </div>
        <div>
          <Label>{t("Phone (WhatsApp)")}</Label>
          <Input name="phone" type="tel" defaultValue={driver?.phone ?? ""} placeholder="+90 5xx xxx xx xx" />
        </div>
        <div>
          <Label>{t("Vehicle")}</Label>
          <Input name="vehicle" defaultValue={driver?.vehicle ?? ""} placeholder="Vito · 07 ABC 123" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("Saving…") : driver ? t("Save") : t("Add driver")}
        </Button>
      </div>
    </form>
  );
}

function DriverRow({ driver, companyId, isAdmin }: { driver: Driver; companyId: string; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, run, t } = useAction();

  if (editing) {
    return (
      <li className="py-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <DriverForm driver={driver} companyId={companyId} onDone={() => setEditing(false)} />
        </div>
      </li>
    );
  }

  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 py-2 text-sm ${driver.is_active ? "" : "opacity-60"}`}>
      <div className="min-w-0">
        <span className="font-medium text-slate-700">{driver.name}</span>
        {!driver.is_active && <span className="ml-2 text-xs text-amber-700">{t("inactive")}</span>}
        <span className="ml-2 text-xs text-slate-500">
          {[driver.phone || t("no phone"), driver.vehicle].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
        <button type="button" onClick={() => setEditing(true)} className="text-teal-600 hover:underline">
          {t("Edit")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setDriverActive(driver.id, !driver.is_active), driver.is_active ? t("Driver deactivated") : t("Driver reactivated"))
          }
          className="text-slate-500 hover:underline"
        >
          {driver.is_active ? t("Deactivate") : t("Reactivate")}
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(t("Delete driver {name}? Deactivating keeps them for past transfers.", { name: driver.name }))) return;
              run(() => deleteDriver(driver.id), t("Driver deleted"));
            }}
            className="text-red-600 hover:underline"
          >
            {t("Delete")}
          </button>
        )}
      </div>
    </li>
  );
}

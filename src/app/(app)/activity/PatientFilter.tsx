"use client";

import { useState } from "react";
import { PatientPicker, PickedPatient } from "@/components/PatientPicker";
import { useT } from "@/i18n/client";

/** The Activity filter's patient field: type to find one; empty means all patients. */
export function PatientFilter({ initial }: { initial: PickedPatient | null }) {
  const t = useT();
  const [patient, setPatient] = useState(initial);
  return <PatientPicker name="patient" value={patient} onChange={setPatient} placeholder={t("All patients")} aria-label={t("Patient")} />;
}

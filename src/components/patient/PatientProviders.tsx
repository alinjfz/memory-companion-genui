"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import { createPatientStepRenderer } from "@/a2ui/PatientStepMirror";

const ACTIVITY_RENDERERS = [createPatientStepRenderer("patient_agent")];

export function PatientProviders({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit-patient"
      agent="patient_agent"
      useSingleEndpoint={false}
      showDevConsole={false}
      renderActivityMessages={ACTIVITY_RENDERERS}
    >
      {children}
    </CopilotKit>
  );
}

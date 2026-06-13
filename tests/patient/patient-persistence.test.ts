import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getPatientsFilePath,
  loadPatientStore,
  savePatientStore,
} from "@/lib/patient-persistence";
import { createPatientAccount, getRecord, reloadPatientStoreFromDisk } from "@/lib/patient-store";

function withEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

test("patient data persists to ECHOES_DATA_DIR across reload", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echoes-test-"));
  const restoreDir = withEnv("ECHOES_DATA_DIR", tempDir);
  const holder = globalThis as typeof globalThis & {
    __echoesPatients?: unknown;
    __echoesPatientsLoaded?: boolean;
  };
  holder.__echoesPatients = undefined;
  holder.__echoesPatientsLoaded = false;

  try {
    const created = createPatientAccount("Test Carer", "carer@echoes.test", "password123");
    assert.ok(created);

    const filePath = getPatientsFilePath();
    assert.equal(fs.existsSync(filePath), true);

    const fromDisk = loadPatientStore();
    assert.ok(fromDisk);
    assert.ok(fromDisk!.patients[created!.accessCode]);

    holder.__echoesPatients = undefined;
    holder.__echoesPatientsLoaded = false;
    reloadPatientStoreFromDisk();

    const reloaded = getRecord(created!.accessCode);
    assert.ok(reloaded);
    assert.equal(reloaded!.caretakerEmail, "carer@echoes.test");
    assert.equal(reloaded!.caretakerName, "Test Carer");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    holder.__echoesPatients = undefined;
    holder.__echoesPatientsLoaded = false;
    restoreDir();
  }
});

test("savePatientStore uses atomic write", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echoes-test-"));
  const restoreDir = withEnv("ECHOES_DATA_DIR", tempDir);

  try {
    savePatientStore({ patients: { "ECHO-TEST": { accessCode: "ECHO-TEST" } }, activeCode: "ECHO-TEST" });
    const filePath = getPatientsFilePath();
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.existsSync(`${filePath}.tmp`), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreDir();
  }
});

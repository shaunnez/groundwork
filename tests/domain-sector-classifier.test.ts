import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySavedOpportunity } from "../server/sector-classifier.ts";

const availableSectors = [
  "Buildings and facilities",
  "Civil and transport infrastructure",
  "Water and utilities",
  "Digital and telecommunications",
  "Professional and business services",
  "Public funding and partnerships",
];

test("specific bridge scope takes precedence over a broad building code", () => {
  assert.deepEqual(
    classifySavedOpportunity({
      title: "Remedial Bridge Works",
      getsCategories: [
        "72000000 - Building and Facility Construction and Maintenance Services",
      ],
      availableSectors,
    }),
    {
      sector: "Civil and transport infrastructure",
      field: "title",
      match: "Bridge",
    },
  );
});

test("a saved GETS category resolves a generic school contractor title", () => {
  const match = classifySavedOpportunity({
    title: "Main Contractor for Block A",
    getsCategories: [
      "72000000 - Building and Facility Construction and Maintenance Services",
    ],
    availableSectors,
  });
  assert.equal(match?.sector, "Buildings and facilities");
  assert.equal(match?.field, "GETS category");
});

test("saved overview is used only after title and category", () => {
  assert.equal(
    classifySavedOpportunity({
      title: "RFP - New Connections 2026",
      overview: "Upgrade connections to the water network.",
      availableSectors,
    })?.sector,
    "Water and utilities",
  );
});

test("a funding notice and generic marketplace are kept distinct", () => {
  assert.equal(
    classifySavedOpportunity({
      title: "Low Emissions Heavy Vehicle Fund",
      availableSectors,
    })?.sector,
    "Public funding and partnerships",
  );
  assert.equal(
    classifySavedOpportunity({
      title: "NZ Government Marketplace - Standing Open Invitation to Apply",
      availableSectors,
    }),
    null,
  );
});

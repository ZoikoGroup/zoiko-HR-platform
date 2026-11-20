import test from "node:test";
import assert from "node:assert/strict";
import { groupsToText, kpisToText, textToGroups, textToKpis }
  from "../src/modules/zoiko-hr/onboarding/OnboardingProfilesSettings.jsx";

test("responsibility groups round-trip through the plain-text editor", () => {
  const groups = [
    { heading: "Full-Stack Web Development", bullets: ["Build features end to end.", "Review pull requests."] },
    { heading: "Frontend Development", bullets: ["Build accessible React screens."] },
  ];
  assert.deepEqual(textToGroups(groupsToText(groups)), groups);
});

test("typed groups: first line is the heading, bullets may start with -, • or *", () => {
  const text = "Delivery\n- Ship planned tasks\n• Fix defects\n\n\nQuality\n* Write tests\n";
  assert.deepEqual(textToGroups(text), [
    { heading: "Delivery", bullets: ["Ship planned tasks", "Fix defects"] },
    { heading: "Quality", bullets: ["Write tests"] },
  ]);
});

test("KPI areas keep their 'Success looks like' statement apart from the bullets", () => {
  const areas = [{ title: "Delivery", bullets: ["Close planned tasks."], success: "Tasks closed on time." },
    { title: "Communication", bullets: [], success: "" }];
  assert.deepEqual(textToKpis(kpisToText(areas)), areas);
  assert.deepEqual(textToKpis("Code quality\n- Tests pass\nsuccess:  Zero failing builds"),
    [{ title: "Code quality", bullets: ["Tests pass"], success: "Zero failing builds" }]);
});

import { it, expect } from "vitest";
import _package from "../package.json";

it("version", () => {
	expect("2.0.0").toBe(_package.version);
});

import _package from "../package.json";
import { pkg } from "../src";

test("version", () => {
	expect(pkg.version).toBe(_package.version);
});

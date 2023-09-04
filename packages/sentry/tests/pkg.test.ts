import _package from "../package.json";

test("version", () => {
	expect("2.0.0").toBe(_package.version);
});

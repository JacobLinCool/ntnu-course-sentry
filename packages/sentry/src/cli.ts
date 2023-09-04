import fs from "node:fs";
import { program } from "commander";
import debug from "debug";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { ChiefSentry } from "./chief";
import { marshal } from "./config";
import { pkg } from "./pkg";

const log = debug("cli");

program
	.version(pkg.version)
	.description(pkg.description)
	.argument("<config-file>", "Path to config file")
	.action(async (file) => {
		try {
			const config = marshal(fs.readFileSync(file, "utf-8"));
			log("config: %O", config);
			new ChiefSentry(config);
		} catch (err) {
			if (err instanceof ZodError) {
				console.error(fromZodError(err).message);
			}
		}
	});

program.parse();

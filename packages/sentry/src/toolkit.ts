import fs from "node:fs";
import chalk from "chalk";
import { program } from "commander";
import debug from "debug";
import { marshal } from "./config";
import { pkg } from "./pkg";
import { Sentry } from "./sentry";

const log = debug("cli");

program
	.version(pkg.version)
	.description(pkg.description)
	.argument("<config-file>", "Path to config file")
	.action(async (file) => {
		const config = marshal(fs.readFileSync(file, "utf-8"));
		log("config: %O", config);

		const sentry = new Sentry(config);
		sentry.on("available", ({ target, seats }) => {
			console.log(
				`${chalk.bgYellowBright("!!!")} course ${chalk.yellowBright(
					target,
				)} has ${chalk.yellowBright(seats)} seats ${chalk.bgYellowBright(
					"!!!",
				)} @ ${new Date().toLocaleString()}`,
			);
		});
		await sentry.start();
	});

program.parse();

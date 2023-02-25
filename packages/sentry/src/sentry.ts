import EventEmitter from "node:events";
import debug from "debug";
import nfetch from "node-fetch";
import { chromium, Response } from "playwright-core";
import type { Browser, LaunchOptions, Page } from "playwright-core";
import { Mutex } from "@jacoblincool/rate-limiter";
import { find_chrome } from "./chrome";
import type { Config } from "./config";
import type { RequiredDeep } from "./types";

const log = debug("sentry");

export class Sentry extends EventEmitter {
	protected config: RequiredDeep<Config>;
	protected browser?: Browser;
	protected page?: Page;
	protected authenticated = Promise.resolve(false);
	protected keeper?: NodeJS.Timer;
	protected watcher?: NodeJS.Timer;
	protected mutex = new Mutex();

	constructor(config: Config) {
		super();
		this.config = {
			auth: {
				solver_token: "",
				...config.auth,
			},
			endpoint: {
				entrypoints: config.endpoint?.entrypoints ?? [
					"https://cos3s.ntnu.edu.tw/AasEnrollStudent/LoginCheckCtrl",
					"https://cos4s.ntnu.edu.tw/AasEnrollStudent/LoginCheckCtrl",
					"https://cos5s.ntnu.edu.tw/AasEnrollStudent/LoginCheckCtrl",
				],
				solver:
					config.endpoint?.solver ??
					"https://jacoblincool-captcha-recognizer.hf.space/run/predict",
			},
			targets: config.targets ?? [],
			settings: {
				interval: config.settings?.interval ?? 60,
				strict: config.settings?.strict ?? false,
				evil: config.settings?.evil ?? false,
			},
			notifications: {
				discord: config.notifications?.discord ?? "",
			},
		};
	}

	async start(opts?: LaunchOptions): Promise<void> {
		this.browser = await chromium.launch({
			executablePath: find_chrome(),
			headless: !process.env.DEBUG?.includes("head"),
			...opts,
		});
		log("start");

		this.page = await this.browser.newPage();

		this.keeper = setInterval(() => {
			this.authenticated = this.login()
				.then(() => true)
				.catch(() => false);
		}, 1000 * 60 * (15 + Math.random() * 2));

		this.authenticated = this.login()
			.then(() => true)
			.catch(() => false);

		this.watcher = setInterval(this.watch.bind(this), 1000 * this.config.settings.interval);
		this.watch();
	}

	async stop(): Promise<void> {
		if (this.watcher) {
			clearInterval(this.watcher);
		}
		if (this.keeper) {
			clearInterval(this.keeper);
		}
		if (this.browser) {
			await this.browser.close();
		}
		log("stop");
	}

	protected async login() {
		const page = this.page;
		if (!page) {
			throw new Error("page not initialized");
		}

		await this.mutex.up();

		try {
			await page.goto(this.endpoint.next().value);

			for (let i = 0; i < 20; i++) {
				try {
					if (page.url().includes("IndexCtrl")) {
						log("login success unexpectedly");
						break;
					}

					await page.reload({ waitUntil: "domcontentloaded" });

					const captcha_response = new Promise<Buffer>((resolve) => {
						const handler = (res: Response) => {
							if (res.url().includes("RandImage")) {
								res.body().then((body) => {
									resolve(body);
									page.off("response", handler);
								});
							}
						};
						page.on("response", handler);
					});

					await page.getByLabel("學號:").click();
					await page.getByLabel("學號:").fill(this.config.auth.username);
					await page.getByLabel("學號:").press("Tab");
					await page.getByLabel("密碼:").fill(this.config.auth.password);

					const buffer = await captcha_response;

					const res = await nfetch(this.config.endpoint.solver, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...(this.config.auth.solver_token && {
								Authorization: "Bearer " + this.config.auth.solver_token,
							}),
						},
						body: JSON.stringify({
							data: ["data:image/jpeg;base64," + buffer.toString("base64")],
						}),
					});

					if (!res.ok) {
						throw new Error(`Solver response not ok: ${res.status}`);
					}

					const solved = await res.json();

					if (solved.data[1] === "not sure") {
						throw new Error("Solver has no confidence");
					}

					log("solved to %s in %s seconds", solved.data[1], solved.duration.toFixed(2));

					await page.locator("[name='validateCode']").fill(solved.data[1]);

					await Promise.all([
						page.waitForEvent("response"),
						page.getByRole("button", { name: "登入" }).click(),
					]);

					await page.waitForTimeout(1000);

					if (page.url().includes("LoginCheckCtrl")) {
						throw new Error("login failed");
					}

					log("login success");
					break;
				} catch (err) {
					log("Failed to solve captcha: %s", err);
				}
				await page.waitForTimeout(1000);
			}

			try {
				await page.getByRole("button", { name: "OK" }).click({ timeout: 3000 });
			} catch {}

			await page.getByRole("button", { name: "下一頁 (開始選課)" }).click();
			await page.waitForLoadState("networkidle");
			await page.waitForTimeout(3000);

			const frame = page.frameLocator("#stfseldListDo");

			await Promise.race([
				frame.getByRole("button", { name: "查詢課程" }).click(),
				frame.locator("#add-btnEl").click(),
			]);
			await page.waitForLoadState("networkidle");
			await page.waitForTimeout(3000);
		} finally {
			this.mutex.down();
		}
	}

	protected watchlist = new Map<string, string>();
	protected course_names = new Map<string, string>();
	protected running = false;
	protected async watch() {
		const hour = ((Math.floor(Date.now()) + 8 * 60 * 60 * 1000) / (1000 * 60 * 60)) % 24;
		const lazy = hour >= 0.05 && hour <= 8.95;
		if (lazy && hour % 1 > 1 / 60) {
			log("lazy mode");
			return;
		}

		const page = this.page;
		if (!page) {
			throw new Error("page not initialized");
		}

		if (this.running) {
			return;
		}
		this.running = true;

		if (!(await this.authenticated)) {
			if (this.config.settings.strict) {
				console.error("not authenticated! Force exit because strict mode is enabled");
				process.exit(1);
			}
			console.warn("not authenticated! you may want to restart the service");
			return;
		}

		await this.mutex.up();

		try {
			for (const target of this.config.targets) {
				let datail_path = this.watchlist.get(target);
				if (!datail_path) {
					log("query details for %s", target);
					const c = await page.evaluate(async (target) => {
						const url = new URL(
							"/AasEnrollStudent/CourseQueryCtrl?action=showGrid",
							// @ts-expect-error window is defined in browser context
							window.location.href,
						).href;
						const body = `serialNo=${target.padStart(
							4,
							"0",
						)}&chnName=&teacher=&deptCode=&formS=&class1=&generalCore=&notFull=0&courseCode=&validQuery=&checkWkSection10=0&checkWkSection11=0&checkWkSection12=0&checkWkSection13=0&checkWkSection14=0&checkWkSection15=0&checkWkSection16=0&checkWkSection17=0&checkWkSection18=0&checkWkSection19=0&checkWkSection110=0&checkWkSection111=0&checkWkSection112=0&checkWkSection113=0&checkWkSection114=0&checkWkSection20=0&checkWkSection21=0&checkWkSection22=0&checkWkSection23=0&checkWkSection24=0&checkWkSection25=0&checkWkSection26=0&checkWkSection27=0&checkWkSection28=0&checkWkSection29=0&checkWkSection210=0&checkWkSection211=0&checkWkSection212=0&checkWkSection213=0&checkWkSection214=0&checkWkSection30=0&checkWkSection31=0&checkWkSection32=0&checkWkSection33=0&checkWkSection34=0&checkWkSection35=0&checkWkSection36=0&checkWkSection37=0&checkWkSection38=0&checkWkSection39=0&checkWkSection310=0&checkWkSection311=0&checkWkSection312=0&checkWkSection313=0&checkWkSection314=0&checkWkSection40=0&checkWkSection41=0&checkWkSection42=0&checkWkSection43=0&checkWkSection44=0&checkWkSection45=0&checkWkSection46=0&checkWkSection47=0&checkWkSection48=0&checkWkSection49=0&checkWkSection410=0&checkWkSection411=0&checkWkSection412=0&checkWkSection413=0&checkWkSection414=0&checkWkSection50=0&checkWkSection51=0&checkWkSection52=0&checkWkSection53=0&checkWkSection54=0&checkWkSection55=0&checkWkSection56=0&checkWkSection57=0&checkWkSection58=0&checkWkSection59=0&checkWkSection510=0&checkWkSection511=0&checkWkSection512=0&checkWkSection513=0&checkWkSection514=0&checkWkSection60=0&checkWkSection61=0&checkWkSection62=0&checkWkSection63=0&checkWkSection64=0&checkWkSection65=0&checkWkSection66=0&checkWkSection67=0&checkWkSection68=0&checkWkSection69=0&checkWkSection610=0&checkWkSection611=0&checkWkSection612=0&checkWkSection613=0&checkWkSection614=0&action=showGrid&actionButton=query&page=1&start=0&limit=1`;
						// @ts-expect-error fetch is defined in browser context
						const res = await fetch(url, {
							method: "POST",
							headers: {
								accept: "*/*",
								"cache-control": "no-cache",
								"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
								pragma: "no-cache",
							},
							body,
						});

						const data = await res.json();

						if (data.Count !== 1) {
							throw new Error(`target ${target} not found`);
						}

						return data.List[0];
					}, target);

					const path = `/AasEnrollStudent/CourseQueryCtrl?year=${c.acadmYear}&term=${c.acadmTerm}&courseCode=${c.courseCode}&courseGroup=${c.courseGroup}&deptCode=${c.deptCode}&formS=${c.formS}&classes1=${c.class1}&deptGroup=${c.deptGroup}&action=showInfo`;
					datail_path = path;
					this.watchlist.set(target, path);
					this.course_names.set(target, c.chnName);
				}

				const seats = await page.evaluate(async (datail_path) => {
					const url = new URL(
						datail_path,
						// @ts-expect-error window is defined in browser context
						window.location.href,
					).href;
					// @ts-expect-error fetch is defined in browser context
					const html = await fetch(url).then((res) => res.text());
					const numbers = [...html.matchAll(/            (\d+)/g)];
					const total = parseInt(numbers[1][1]);
					const enrolled = parseInt(numbers[3][1]);
					const seats = total - enrolled;
					return seats;
				}, datail_path);

				log("checked %O", { target, seats });

				if (seats > 0) {
					this.emit("available", { target, seats });
					if (this.config.notifications.discord) {
						try {
							await nfetch(this.config.notifications.discord, {
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									username: "Course Sentry",
									content: `!!! **${target}** ${
										this.course_names.get(target) || ""
									} has **${seats}** seats available now !!! Go to ${
										this.endpoint.next().value
									} and enroll it!`,
								}),
							});
						} catch (err) {
							console.warn("Failed to send notification", err);
						}
					}
				}
			}
		} finally {
			this.mutex.down();
			this.running = false;
		}
	}

	protected endpoint = function* (this: Sentry) {
		let i = 0;
		while (true) {
			const entrypoint = this.config.endpoint.entrypoints[i];
			log("endpoint: %s", entrypoint);
			yield entrypoint;
			i = (i + 1) % this.config.endpoint.entrypoints.length;
		}
	}.bind(this)();
}

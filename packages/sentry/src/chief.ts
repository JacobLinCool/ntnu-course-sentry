import debug from "debug";
import { Config } from "./config";
import { send_discord_message } from "./notification";
import { Sentry } from "./sentry";

const log = debug("sentry:chief");

export class ChiefSentry {
	protected subordinates: Sentry[] = [];

	constructor(public config: Config) {
		for (const target of this.config.targets) {
			this.add(target);
		}
	}

	public add(target: string): boolean {
		if (this.subordinates.some((s) => s.target === target)) {
			return false;
		}

		const sentry = new Sentry(
			this.config.settings.year,
			this.config.settings.term,
			target,
			this.config.settings.interval,
		);

		sentry.on("available", (course) => {
			const left = parseInt(course.限修人數) - parseInt(course.選修人數);
			const message = `${course.中文課程名稱} (${
				course.開課序號
			}) is available with ${left} seat${
				left > 1 ? "s" : ""
			} left. Go to https://cos1s.ntnu.edu.tw/AasEnrollStudent/LoginCheckCtrl to enroll now!`;
			console.log(message);

			if (this.config.notification?.discord) {
				send_discord_message(this.config.notification.discord, message).catch(log);
			}
		});
		sentry.on("full", (course) => {
			const message = `${course.中文課程名稱} (${course.開課序號}) is full with ${course.選修人數} students (limit: ${course.限修人數})`;
			console.log(message);

			if (this.config.notification?.discord) {
				send_discord_message(this.config.notification.discord, message).catch(log);
			}
		});

		this.subordinates.push(sentry);
		sentry.start();

		return true;
	}

	public remove(target: string): boolean {
		const index = this.subordinates.findIndex((s) => s.target === target);
		if (index === -1) {
			return false;
		}

		const sentry = this.subordinates[index];
		sentry.stop();
		this.subordinates.splice(index, 1);

		return true;
	}

	public pause(): void {
		for (const sentry of this.subordinates) {
			sentry.stop();
		}
	}

	public resume(): void {
		for (const sentry of this.subordinates) {
			sentry.start();
		}
	}
}

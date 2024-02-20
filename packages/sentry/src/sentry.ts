import debug from "debug";
import EventEmitter from "node:events";
import type { CourseJSON, NumberLike } from "ntnu-course-list";
import { CourseListFetcher } from "ntnu-course-list";

export class Sentry extends EventEmitter {
	protected log: debug.Debugger;
	protected fetcher: CourseListFetcher;
	protected timer: NodeJS.Timeout | undefined;
	protected _cached: CourseJSON | undefined;

	constructor(
		public readonly year: number,
		public readonly term: number,
		public readonly target: string,
		public readonly interval: number,
	) {
		super();
		this.log = debug(`sentry:${target}`);
		this.fetcher = new CourseListFetcher();
	}

	public get cached(): CourseJSON | undefined {
		return this._cached;
	}

	public start(): void {
		if (this.timer) {
			this.log("start: timer already exists, ignore");
			return;
		}

		this.log("start");
		const watch = this.watch.bind(this);

		watch();
	}

	public stop(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.log("stop");
		} else {
			this.log("stop: timer not found, ignore");
		}
	}
	protected async watch() {
		try {
			const hour = ((Math.floor(Date.now()) + 8 * 60 * 60 * 1000) / (1000 * 60 * 60)) % 24;
			const lazy = hour >= 0.05 && hour <= 8.95;
			if (lazy && hour % 1 > 1 / 60) {
				throw new Error("sleep");
			}

			const list = await this.fetcher.json({
				year: this.year,
				term: this.term,
				serial_number: this.target as NumberLike,
			});
			if (list.length !== 1) {
				throw new Error(`target "${this.target}" not found`);
			}

			const course = list[0];
			this.log("checkout", course);
			this.emit("checkout", course);

			if (!this._cached || this._cached.選修人數 !== course.選修人數) {
				this.emit("change", course);

				if (course.選修人數 < (this._cached?.選修人數 ?? course.限修人數)) {
					this.emit("available", course);
				} else if (course.選修人數 >= course.限修人數) {
					this.emit("full", course);
				}
			}

			this._cached = course;
		} catch (err) {
			if (err instanceof Error) {
				this.log(err.message);
			}
		} finally {
			this.timer = setTimeout(this.watch.bind(this), this.interval * 1000);
		}
	}

	public on(event: "checkout", listener: (course: CourseJSON) => void): this;
	public on(event: "change", listener: (course: CourseJSON) => void): this;
	public on(event: "full", listener: (course: CourseJSON) => void): this;
	public on(event: "available", listener: (course: CourseJSON) => void): this;
	public on(event: string, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}

	public once(event: "checkout", listener: (course: CourseJSON) => void): this;
	public once(event: "change", listener: (course: CourseJSON) => void): this;
	public once(event: "full", listener: (course: CourseJSON) => void): this;
	public once(event: "available", listener: (course: CourseJSON) => void): this;
	public once(event: string, listener: (...args: any[]) => void): this {
		return super.once(event, listener);
	}

	public off(event: "checkout", listener: (course: CourseJSON) => void): this;
	public off(event: "change", listener: (course: CourseJSON) => void): this;
	public off(event: "full", listener: (course: CourseJSON) => void): this;
	public off(event: "available", listener: (course: CourseJSON) => void): this;
	public off(event: string, listener: (...args: any[]) => void): this {
		return super.off(event, listener);
	}
}

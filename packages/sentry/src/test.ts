import { CourseListFetcher } from "ntnu-course-list";

main();

async function main() {
	const fetcher = new CourseListFetcher();
	fetcher.debug(true);

	const list = await fetcher.json({
		year: 112,
		term: 1,
		serial_number: "0319",
	});
}

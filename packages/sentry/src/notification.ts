import fetch from "node-fetch";

export async function send_discord_message(webhook: string, content: string) {
	const res = await fetch(webhook, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			username: "Course Sentry",
			content,
		}),
	});
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${res.statusText}`);
	}
}

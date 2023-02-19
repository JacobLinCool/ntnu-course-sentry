import YAML from "js-yaml";
import { z } from "zod";

export const ConfigSchema = z.object({
	auth: z.object({
		username: z.string(),
		password: z.string(),
		solver_token: z.string().optional(),
	}),
	endpoint: z
		.object({
			entrypoints: z.array(z.string()).optional(),
			solver: z.string().optional(),
		})
		.optional(),
	targets: z.array(z.string()).optional(),
	settings: z
		.object({
			interval: z.number().optional(),
		})
		.optional(),
	notifications: z
		.object({
			discord: z.string().url().optional(),
		})
		.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function marshal(data: string) {
	return ConfigSchema.parse(YAML.load(data));
}

export function unmarshal(data: z.infer<typeof ConfigSchema>) {
	return YAML.dump(data);
}

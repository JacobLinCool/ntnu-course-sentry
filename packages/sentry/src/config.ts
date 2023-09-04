import YAML from "js-yaml";
import { z } from "zod";

export const ConfigSchema = z.object({
	targets: z.array(z.string()),
	settings: z.object({
		year: z.number(),
		term: z.number(),
		interval: z.number(),
	}),
	notification: z
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

export type RequiredDeep<T> = {
	[P in keyof T]-?: RequiredDeep<T[P]>;
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		google?: {
			accounts: {
				oauth2: {
					initTokenClient(config: {
						client_id: string;
						scope: string;
						callback: (response: {
							access_token?: string;
							error?: string;
							expires_in?: number;
							scope?: string;
						}) => void;
						error_callback?: (err: any) => void;
						prompt?: string;
						hint?: string;
					}): {
						requestAccessToken(overrideConfig?: { prompt?: string; hint?: string }): void;
					};
					revoke(accessToken: string, done: () => void): void;
				};
			};
		};
	}
}

export {};

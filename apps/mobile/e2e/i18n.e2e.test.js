/* eslint-disable no-undef */
const { device, element, by, expect, waitFor } = require('detox');

describe('i18n – Spanish empty-state', () => {
	it('switches locale dynamically to Spanish on the same app instance', async () => {
		// Start in English, empty variant (same instance)
		await device.launchApp({
			newInstance: true,
			url: 'chat://connections?variant=empty&locale=en',
		});
		const emptyView = element(by.id('empty-state'));
		await waitFor(emptyView).toBeVisible().withTimeout(8000);

		// Switch locale at runtime via deep link
		await device.openURL({ url: 'chat://connections?locale=es' });
		await expect(element(by.id('empty-state-text'))).toHaveText(
			'No hay hebras todavía. Invita a un amigo para empezar.',
		);
	});
});



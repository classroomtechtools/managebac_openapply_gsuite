(function () {
	'use strict';

	let assert = require('chai').assert;
	let virtual = require('./virtual.js');
	let sinon = require('sinon');

	describe("Unit Tests", function () {

		it("Loads okay", function () {
			var request = virtual.ApiWrapper('yikes');
			virtual.UrlFetchApp = {
				fetch: function () {
					return {
						getResponseCode: function () {
							return 200;
						},
						getResponseText: function () {
							return 'hi';
						}
					}
				},
				getResponseCode: function () {
					return 200;
				}
			}
			var hi = request.fetch().getResponseText();
			assert.equal(hi, 'hi');
		});

	});

})();
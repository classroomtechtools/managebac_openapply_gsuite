(function () {
	'use strict';

	let assert = require('chai').assert;
	let virtual = require('./virtual.js');

	describe("ApiWrapper", function () {

		virtual.UrlFetchApp = {
			fetch: function () {
				return {
					getResponseCode: function () {
						return 200;
					},
					getContentText: function () {
						return '{"test": "hi"}';
					}
				}
			},
			getResponseCode: function () {
				return 200;
			}
		}

		it('fails when not provided url', function () {
			assert.throws(function () {
				var request = virtual.ApiWrapper();
			}, 'requires url');
		});

		it("calls to fetch returns object with getContentText", function () {
			var request = virtual.ApiWrapper('');
			var hi = request.fetch("url");
			assert.isFunction(hi.getContentText, 'contains a function called getContentText');
			assert.equal(hi.getContentText(), '{"test": "hi"}');
		});

		it("calls to fetchJson returns object", function () {
			var request = virtual.ApiWrapper('');
			var result = request.fetchJson("url");
			assert.deepEqual({test: 'hi'}, result, 'returns object');
		});

		it("setQuery formats strings", function () {
			var request = virtual.ApiWrapper('');
			request.setQuery({test:'test', test2:'test2'});
			var result = request.getQuery();
			assert.equal('?test=test&test2=test2', result)
		});

		it("setParam updates with consecutive calls", function () {
			var request = virtual.ApiWrapper('');
			request.setParam('test', 'test');
			request.setParam('test2', 'test2');
			var result = request.getParam();
			assert.deepEqual({test: 'test', test2: 'test2'}, result);
		});

		it("formatUrl returns formatted with {}", function () {
			var request = virtual.ApiWrapper('{test} {test2}');
			var result = request.formatUrl({
				test: 'test',
				test2: 'test2'
			});
			assert.equal('test test2', result)
		});

		it('chains', function () {
			var result = virtual.ApiWrapper('{test}')
				.setParam('param1', 'param1')
				.setParam('param2', 'param2')
				.setQuery({'test': 'test'})
				.fetch({test: 'howdy'})
				.getContentText();
			assert.equal('{"test": "hi"}', result)
		});


	});

})();
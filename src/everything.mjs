import * as metro from './metro.mjs'
import * as assert from './assert.mjs'
import jsonmw from './mw/json.mjs'
import thrower from './mw/thrower.mjs'

window.assert = assert
window.metro = Object.assign({}, metro, {
	mw: {
		jsonmw,
		thrower
	}
})
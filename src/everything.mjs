import * as m from './metro.mjs'
import jsonmw from './mw/json.mjs'
import thrower from './mw/thrower.mjs'

const metro = Object.assign({}, m, {
	mw: {
		jsonmw,
		thrower
	}
})

globalThis.metro = metro

export default metro
// The IPFS compliance suites import `expect` from aegir (IPFS's build tool). The same chai, with
// the plugins aegir adds, serves without the tool.
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiSubset from 'chai-subset'
import chaiBites from 'chai-bites'

chai.use(chaiAsPromised)
chai.use(chaiSubset)
chai.use(chaiBites)
// aegir's assertions can be called, `.to.be.true()` (chai-parentheses, which chai 5 refuses):
// these properties assert as before and then give back something callable.
chai.use((c) => {
  for (const name of ['ok', 'true', 'false', 'null', 'undefined', 'empty', 'exist']) {
    c.Assertion.overwriteProperty(name, (base: () => void) => function (this: object) {
      base.call(this)
      return () => this
    })
  }
})

export const expect = chai.expect
export const assert = chai.assert

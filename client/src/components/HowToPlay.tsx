import { Link } from 'react-router-dom'
import { RulesContent } from './RulesContent'
import { LogoMark } from './ui'

export function HowToPlay() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          <LogoMark />
          <span>Signal Squad</span>
        </Link>
        <nav>
          <Link to="/">Back</Link>
        </nav>
      </header>
      <main id="content" className="page">
        <p className="eyebrow">Field manual</p>
        <h1>How to play</h1>
        <p className="lede">Two to six agents, one shared clock, and fragments that only make sense together.</p>
        <RulesContent />
      </main>
    </>
  )
}

import { useState, type FormEvent } from 'react'
import { CalendarDays, Check, CircleAlert, GraduationCap, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'

export type AuthMode = 'signup' | 'login'

export default function AuthScreen({ configured, initialMode, error, notice, loading, onSubmit, onResendVerification, onModeChange }: {
  configured: boolean
  initialMode: AuthMode
  error: string
  notice: string
  loading: boolean
  onSubmit: (mode: AuthMode, schoolName: string, email: string, password: string) => Promise<boolean>
  onResendVerification: (email: string) => Promise<boolean>
  onModeChange: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const signingUp = mode === 'signup'

  const changeMode = () => {
    setMode(signingUp ? 'login' : 'signup')
    setVerificationPending(false)
    onModeChange()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit(mode, schoolName.trim(), email.trim(), password).then(succeeded => {
      if (succeeded && signingUp) {
        setMode('login')
        setVerificationPending(true)
      }
    })
  }

  const resendVerification = async () => {
    setResendLoading(true)
    await onResendVerification(email.trim())
    setResendLoading(false)
  }

  return <main className="auth-page">
    <div className="auth-visual" aria-label="College campus">
      <img src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1600&q=85" alt="College students celebrating together outdoors" />
      <div className="auth-visual-shade" />
      <div className="auth-visual-content">
        <span className="auth-visual-kicker"><Sparkles size={15} /> YOUR IDEAS. YOUR CAMPUS. YOUR PLAN.</span>
        <h2>Make room<br />for what’s next.</h2>
        <p>Bring your classes, faculty, rooms, and time together in one bright, beautifully organized space.</p>
        <div className="auth-visual-points"><span><Check size={15} />Plan your week</span><span><Check size={15} />Keep your data private</span></div>
      </div>
      <div className="auth-campus-tag"><span><GraduationCap size={19} /></span><div><b>Built for campus life</b><small>Your timetable, all in one place</small></div></div>
    </div>
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="brand-mark"><CalendarDays size={21} /></span><div><strong>Relations</strong><small>Timetable Studio</small></div></div>
      <span className="eyebrow">{signingUp ? 'YOUR PRIVATE PLANNING SPACE' : 'WELCOME BACK'}</span>
      <h1 id="auth-title">{signingUp ? 'Create your account' : 'Sign in to your account'}</h1>
      <p className="auth-intro">{signingUp ? 'Create an account with your college or school email to save your timetable securely.' : 'Sign in with your college or school email and Relations Studio password.'}</p>

      {error && <div className="auth-message auth-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
      {notice && <div className="auth-message auth-notice" role="status"><ShieldCheck size={17} /><span>{notice}{verificationPending && <button type="button" className="auth-resend" disabled={resendLoading || loading || !email.trim()} onClick={() => void resendVerification()}>{resendLoading ? 'Sending…' : 'Resend verification email'}</button>}</span></div>}
      {!configured && <div className="auth-setup" role="status"><strong>Finish connecting Supabase</strong><span>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then follow the Supabase setup steps in README. Signup and login will be available once configured.</span></div>}

      <form className="auth-form" onSubmit={submit}>
        {signingUp && <label className="auth-field"><span>College / school name</span><input value={schoolName} onChange={event => setSchoolName(event.target.value)} autoComplete="organization" placeholder="Your college or school" minLength={2} maxLength={160} required disabled={!configured || loading} /></label>}
        <label className="auth-field"><span>College / school email ID</span><div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@college.edu" maxLength={254} required disabled={!configured || loading} /></div></label>
        <label className="auth-field"><span>Relations Studio password</span><div className="auth-input-wrap"><LockKeyhole size={17} /><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={signingUp ? 'new-password' : 'current-password'} placeholder={signingUp ? 'Create a password for this website' : 'Your website password'} minLength={8} maxLength={72} required disabled={!configured || loading} /></div>{signingUp && <small>Create a password just for this website. Never enter your email account password.</small>}</label>
        <button className="auth-submit" type="submit" disabled={!configured || loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}{loading ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}</button>
      </form>

      <p className="auth-switch">{signingUp ? 'Already have an account?' : 'New to Relations Studio?'} <button type="button" onClick={changeMode}>{signingUp ? 'Sign in' : 'Create account'}</button></p>
      <div className="auth-security"><ShieldCheck size={15} /><span>Protected by Supabase Auth. Your timetable is private to your account.</span></div>
    </section>
  </main>
}

import { useState, type FormEvent } from 'react'
import { CalendarDays, CircleAlert, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'

export type AuthMode = 'signup' | 'login'

export default function AuthScreen({ configured, initialMode, error, notice, loading, onSubmit, onModeChange }: {
  configured: boolean
  initialMode: AuthMode
  error: string
  notice: string
  loading: boolean
  onSubmit: (mode: AuthMode, fullName: string, email: string, password: string) => Promise<boolean>
  onModeChange: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signingUp = mode === 'signup'

  const changeMode = () => {
    setMode(signingUp ? 'login' : 'signup')
    onModeChange()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit(mode, fullName.trim(), email.trim(), password).then(succeeded => {
      if (succeeded && signingUp) setMode('login')
    })
  }

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="brand-mark"><CalendarDays size={21} /></span><div><strong>Relations</strong><small>Timetable Studio</small></div></div>
      <span className="eyebrow">{signingUp ? 'YOUR PRIVATE PLANNING SPACE' : 'WELCOME BACK'}</span>
      <h1 id="auth-title">{signingUp ? 'Create your account' : 'Sign in to your account'}</h1>
      <p className="auth-intro">{signingUp ? 'Sign up once to save your timetable and planning details securely to your account.' : 'Use the email and password you registered with to open your timetable.'}</p>

      {error && <div className="auth-message auth-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
      {notice && <div className="auth-message auth-notice" role="status"><ShieldCheck size={17} /><span>{notice}</span></div>}
      {!configured && <div className="auth-setup" role="status"><strong>Finish connecting Supabase</strong><span>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then follow the Supabase setup steps in README. Signup and login will be available once configured.</span></div>}

      <form className="auth-form" onSubmit={submit}>
        {signingUp && <label className="auth-field"><span>Full name</span><input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="Your name" minLength={2} maxLength={100} required disabled={!configured || loading} /></label>}
        <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={!configured || loading} /></div></label>
        <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><LockKeyhole size={17} /><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={signingUp ? 'new-password' : 'current-password'} placeholder={signingUp ? 'At least 8 characters' : 'Your password'} minLength={8} maxLength={72} required disabled={!configured || loading} /></div>{signingUp && <small>Use at least 8 characters.</small>}</label>
        <button className="auth-submit" type="submit" disabled={!configured || loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}{loading ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}</button>
      </form>

      <p className="auth-switch">{signingUp ? 'Already have an account?' : 'New to Relations Studio?'} <button type="button" onClick={changeMode}>{signingUp ? 'Sign in' : 'Create account'}</button></p>
      <div className="auth-security"><ShieldCheck size={15} /><span>Protected by Supabase Auth. Your timetable is private to your account.</span></div>
    </section>
  </main>
}

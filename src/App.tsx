import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getVersion, initDb, subscribe } from './db/db'
import { getUser } from './db/queries'
import { getSessionUserId, setSessionUserId } from './lib/session'
import type { User } from './lib/types'
import { AuthScreen } from './screens/Auth'
import { HomeScreen } from './screens/Home'
import { CalendarScreen } from './screens/Calendar'
import { StatsScreen } from './screens/Stats'
import { ExercisesScreen } from './screens/Exercises'
import { ProfileScreen } from './screens/Profile'
import { WorkoutEditor } from './screens/WorkoutEditor'
import { BottomNav, type Tab } from './components/Nav'
import { Button, Icon } from './components/ui'
import { Toaster } from './components/Toaster'
import { todayISO } from './lib/dates'

type Route =
  | { name: 'home' | 'calendar' | 'stats' | 'exercises' | 'profile' }
  | { name: 'new'; date?: string; exerciseId?: string }
  | { name: 'edit'; id: string }

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  const params = new URLSearchParams(qs ?? '')

  if (path.startsWith('w/')) {
    const id = path.slice(2)
    if (id === 'new' || id === '') {
      return {
        name: 'new',
        date: params.get('d') ?? undefined,
        exerciseId: params.get('ex') ?? undefined,
      }
    }
    return { name: 'edit', id }
  }
  switch (path) {
    case 'cal':
      return { name: 'calendar' }
    case 'stats':
      return { name: 'stats' }
    case 'ex':
      return { name: 'exercises' }
    case 'me':
      return { name: 'profile' }
    default:
      return { name: 'home' }
  }
}

function navigate(path: string, replace = false) {
  const target = `#/${path}`
  if (window.location.hash === target) return
  if (replace) history.replaceState(null, '', target)
  else window.location.hash = target
}

function Splash() {
  return (
    <div className="min-h-dvh hero-glow flex flex-col items-center justify-center gap-4">
      <img
        src="/icons/icon-192.png"
        alt=""
        className="h-16 w-16 rounded-[18px] shadow-lg shadow-lime/10"
      />
      <div className="text-center">
        <p className="text-[17px] font-bold tracking-tight">PalestraLogger</p>
        <p className="mt-1 text-[12px] text-muted">Preparo il tuo diario…</p>
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-surface2">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-lime" />
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(() => getSessionUserId())
  const [route, setRoute] = useState<Route>(() => parseHash())
  const version = useSyncExternalStore(subscribe, getVersion)

  useEffect(() => {
    let alive = true
    initDb()
      .then(() => alive && setReady(true))
      .catch((e: unknown) => {
        console.error(e)
        if (alive) setBootError(e instanceof Error ? e.message : 'Errore di inizializzazione')
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const user: User | null = useMemo(
    () => (sessionId ? getUser(sessionId) : null),
    [sessionId, version],
  )

  useEffect(() => {
    if (sessionId && ready && !user) {
      setSessionUserId(null)
      setSessionId(null)
    }
  }, [sessionId, ready, user])

  if (bootError) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-danger/15 border border-danger/30 text-danger flex items-center justify-center">
          <Icon name="info" size={22} />
        </div>
        <div>
          <p className="text-[15px] font-semibold">Impossibile aprire il database</p>
          <p className="mt-1 text-[12px] text-muted max-w-[280px]">{bootError}</p>
        </div>
        <Button onClick={() => window.location.reload()}>Riprova</Button>
      </div>
    )
  }

  if (!ready) return <Splash />

  if (!user) {
    return (
      <>
        <AuthScreen
          onLogin={(id) => {
            setSessionUserId(id)
            setSessionId(id)
            navigate('home', true)
            setRoute({ name: 'home' })
          }}
        />
        <Toaster />
      </>
    )
  }

  const isEditor = route.name === 'new' || route.name === 'edit'

  const goTab = (t: Tab) => navigate(t === 'home' ? 'home' : t === 'calendar' ? 'cal' : t === 'stats' ? 'stats' : 'ex')

  const onLogout = () => {
    setSessionUserId(null)
    setSessionId(null)
    navigate('home', true)
    setRoute({ name: 'home' })
  }

  const closeEditor = () => {
    navigate('home', true)
    setRoute({ name: 'home' })
  }

  const openNew = (date?: string) => {
    navigate(`w/new?d=${date ?? todayISO()}`)
    setRoute({ name: 'new', date })
  }

  const openWorkout = (id: string) => {
    navigate(`w/${id}`)
    setRoute({ name: 'edit', id })
  }

  return (
    <>
      <main className="min-h-dvh">
        {route.name === 'home' && (
          <HomeScreen
            user={user}
            onNew={openNew}
            onOpenWorkout={openWorkout}
            onGoCalendar={() => goTab('calendar')}
            onGoStats={() => goTab('stats')}
            onGoProfile={() => {
              navigate('me')
              setRoute({ name: 'profile' })
            }}
          />
        )}

        {route.name === 'calendar' && (
          <CalendarScreen
            user={user}
            onNew={openNew}
            onOpenWorkout={openWorkout}
            onGoStats={() => goTab('stats')}
          />
        )}

        {route.name === 'stats' && <StatsScreen user={user} onNew={() => openNew()} />}

        {route.name === 'exercises' && (
          <ExercisesScreen
            user={user}
            onQuickAdd={(exerciseId) => {
              navigate(`w/new?d=${todayISO()}&ex=${exerciseId}`)
              setRoute({ name: 'new', date: todayISO(), exerciseId })
            }}
          />
        )}

        {route.name === 'profile' && (
          <ProfileScreen
            user={user}
            onLogout={onLogout}
            onUserChanged={() => setSessionId(user.id)}
            onGoExercises={() => {
              navigate('ex')
              setRoute({ name: 'exercises' })
            }}
          />
        )}

        {route.name === 'new' && (
          <WorkoutEditor
            userId={user.id}
            initialDate={route.date}
            initialExerciseId={route.exerciseId}
            onClose={closeEditor}
            onSaved={closeEditor}
            onDeleted={closeEditor}
          />
        )}

        {route.name === 'edit' && (
          <WorkoutEditor
            userId={user.id}
            workoutId={route.id}
            onClose={closeEditor}
            onSaved={closeEditor}
            onDeleted={closeEditor}
          />
        )}

        {!isEditor && (
          <div className="h-24" aria-hidden="true" />
        )}
      </main>

      {!isEditor && (
        <BottomNav
          tab={
            route.name === 'calendar'
              ? 'calendar'
              : route.name === 'stats'
                ? 'stats'
                : route.name === 'exercises'
                  ? 'exercises'
                  : 'home'
          }
          onNavigate={goTab}
          onNew={() => openNew()}
        />
      )}
      <Toaster />
    </>
  )
}

import { useState, useMemo, useCallback, useEffect } from 'react'
import { supabase, type Employee, type AttendanceRecord } from './lib/supabase'

const STATUS_META = {
  P: { label: 'Present',        bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  A: { label: 'Absent',         bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
  L: { label: 'Leave (Unpaid)', bg: '#fef9c3', text: '#ca8a04', border: '#fde047' },
  H: { label: 'Holiday (Paid)', bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
} as const
type Status = keyof typeof STATUS_META

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const TABS = ['Dashboard', 'Attendance', 'Payroll', 'Employees'] as const
type Tab = typeof TABS[number]

const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const getDOW = (y: number, m: number, d: number) => new Date(y, m, d).getDay()
const isWeekend = (y: number, m: number, d: number) => { const w = getDOW(y,m,d); return w===0||w===6 }
const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: 'EMP001', name: 'Divya Shah',       designation: 'Designer',             joining_date: '2026-04-01', monthly_salary: 31200 },
  { id: 'EMP002', name: 'Niti Naik',         designation: 'Brand Manager',        joining_date: '2026-04-01', monthly_salary: 10000 },
  { id: 'EMP003', name: 'Gur Simar Singh',   designation: 'Designer',             joining_date: '2026-04-01', monthly_salary: 21000 },
  { id: 'EMP004', name: 'Aashi Shah',        designation: 'Brand Manager',        joining_date: '2026-04-01', monthly_salary: 27500 },
  { id: 'EMP005', name: 'Vrudhi Shah',       designation: 'Designer',             joining_date: '2026-04-01', monthly_salary: 10000 },
  { id: 'EMP006', name: 'Muskan Somani',     designation: 'Jr. Developer',        joining_date: '2026-04-01', monthly_salary: 10000 },
  { id: 'EMP007', name: 'Siddhi Tandel',     designation: 'Jr. Consultant',       joining_date: '2026-04-01', monthly_salary: 21000 },
  { id: 'EMP008', name: 'Mohit Singh',       designation: 'Video Editor',         joining_date: '2026-04-01', monthly_salary: 18000 },
  { id: 'EMP009', name: 'Niyati Sisodiya',   designation: 'Social Media Manager', joining_date: '2026-04-01', monthly_salary: 8000  },
]

export default function App() {
  const today = new Date()
  const [activeTab, setActiveTab] = useState<Tab>('Attendance')
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Record<string, Record<string, Record<number, Status>>>>({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [dbConnected, setDbConnected] = useState(false)
  const [bulkStatus, setBulkStatus]   = useState<Status>('P')
  const [addingEmp, setAddingEmp]     = useState(false)
  const [newEmp, setNewEmp] = useState({ name: '', designation: '', salary: '' })
  const [toast, setToast]   = useState<{ msg: string; type: 'ok'|'err' } | null>(null)

  const showToast = (msg: string, type: 'ok'|'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: emps, error: empErr } = await supabase.from('employees').select('*').order('id')
        if (empErr) throw empErr
        const { data: att, error: attErr } = await supabase.from('attendance').select('*')
        if (attErr) throw attErr
        if (emps && emps.length > 0) {
          setEmployees(emps)
        } else {
          await supabase.from('employees').insert(DEFAULT_EMPLOYEES)
          setEmployees(DEFAULT_EMPLOYEES)
        }
        const map: Record<string, Record<string, Record<number, Status>>> = {}
        if (att) {
          att.forEach((r: AttendanceRecord) => {
            const mk = `${r.year}-${r.month}`
            if (!map[mk]) map[mk] = {}
            if (!map[mk][r.employee_id]) map[mk][r.employee_id] = {}
            map[mk][r.employee_id][r.day] = r.status
          })
        }
        setAttendance(map)
        setDbConnected(true)
      } catch {
        setEmployees(DEFAULT_EMPLOYEES)
        setDbConnected(false)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const monthKey = `${year}-${month}`
  const daysInMonth = getDaysInMonth(year, month)

  const getStatus = useCallback((empId: string, day: number): Status | '' => {
    return attendance[monthKey]?.[empId]?.[day] || ''
  }, [attendance, monthKey])

  const setStatus = useCallback(async (empId: string, day: number, status: Status) => {
    const current = attendance[monthKey]?.[empId]?.[day]
    const newStatus = current === status ? undefined : status
    setAttendance(prev => {
      const next = { ...prev, [monthKey]: { ...prev[monthKey], [empId]: { ...prev[monthKey]?.[empId] } } }
      if (newStatus) next[monthKey][empId][day] = newStatus
      else delete next[monthKey][empId][day]
      return next
    })
    if (dbConnected) {
      setSaving(true)
      if (newStatus) {
        await supabase.from('attendance').upsert({ employee_id: empId, year, month, day, status: newStatus }, { onConflict: 'employee_id,year,month,day' })
      } else {
        await supabase.from('attendance').delete().match({ employee_id: empId, year, month, day })
      }
      setSaving(false)
    }
  }, [attendance, monthKey, year, month, dbConnected])

  const fillAll = useCallback(async (empId: string, status: Status) => {
    const records: AttendanceRecord[] = []
    const newDays: Record<number, Status> = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const s: Status = isWeekend(year, month, d) ? 'H' : status
      newDays[d] = s
      records.push({ employee_id: empId, year, month, day: d, status: s })
    }
    setAttendance(prev => ({ ...prev, [monthKey]: { ...prev[monthKey], [empId]: newDays } }))
    if (dbConnected) {
      setSaving(true)
      await supabase.from('attendance').delete().match({ employee_id: empId, year, month })
      await supabase.from('attendance').insert(records)
      setSaving(false)
      showToast('Attendance saved ✓')
    }
  }, [monthKey, daysInMonth, year, month, dbConnected])

  const fillDay = useCallback(async (day: number, status: Status) => {
    const records: AttendanceRecord[] = []
    setAttendance(prev => {
      const next = { ...prev, [monthKey]: { ...prev[monthKey] } }
      employees.forEach(emp => {
        next[monthKey][emp.id] = { ...next[monthKey]?.[emp.id], [day]: status }
        records.push({ employee_id: emp.id, year, month, day, status })
      })
      return next
    })
    if (dbConnected) {
      setSaving(true)
      for (const r of records) await supabase.from('attendance').upsert(r, { onConflict: 'employee_id,year,month,day' })
      setSaving(false)
    }
  }, [monthKey, employees, year, month, dbConnected])

  const addEmployee = useCallback(async () => {
    if (!newEmp.name || !newEmp.salary) return
    const id = `EMP${String(employees.length + 1).padStart(3, '0')}`
    const emp: Employee = { id, name: newEmp.name, designation: newEmp.designation, joining_date: new Date().toISOString().split('T')[0], monthly_salary: Number(newEmp.salary) }
    setEmployees(prev => [...prev, emp])
    setNewEmp({ name: '', designation: '', salary: '' })
    setAddingEmp(false)
    if (dbConnected) {
      const { error } = await supabase.from('employees').insert(emp)
      if (error) showToast('Error saving employee', 'err')
      else showToast(`${emp.name} added ✓`)
    }
  }, [employees, newEmp, dbConnected])

  const navMonth = (dir: number) => {
    let m = month + dir, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  const empStats = useMemo(() => {
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
    const todayDay = isCurrentMonth ? today.getDate() : daysInMonth
    return employees.map(emp => {
      let P = 0, A = 0, L = 0, H = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const s = getStatus(emp.id, d)
        if (s === 'P') P++; else if (s === 'A') A++; else if (s === 'L') L++; else if (s === 'H') H++
      }
      const perDay    = emp.monthly_salary / 26
      const deduction = (A + L) * perDay
      const finalSal  = emp.monthly_salary - deduction
      const workDays  = P + A + L + H
      const attPct    = workDays > 0 ? Math.round(((P + H) / workDays) * 100) : 0
      let earnedDays  = 0
      for (let d = 1; d <= todayDay; d++) {
        const s = getStatus(emp.id, d)
        if (s === 'P' || s === 'H') earnedDays++
      }
      return { ...emp, P, A, L, H, perDay, deduction, finalSal, attPct, earnedDays, earned: earnedDays * perDay }
    })
  }, [employees, getStatus, daysInMonth, year, month])

  const totals = useMemo(() => empStats.reduce((a, e) => ({
    P: a.P+e.P, A: a.A+e.A, L: a.L+e.L, H: a.H+e.H,
    salary: a.salary+e.monthly_salary, deduction: a.deduction+e.deduction,
    finalSal: a.finalSal+e.finalSal, earned: a.earned+e.earned
  }), { P:0,A:0,L:0,H:0,salary:0,deduction:0,finalSal:0,earned:0 }), [empStats])

  const cell = { padding: '11px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }
  const hdr  = (right?: boolean) => ({ padding: '10px 14px', fontWeight: 600, fontSize: 11, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' as const, textAlign: right ? ('right' as const) : ('left' as const) })
  const badge = (bg: string, text: string) => ({ background: bg, color: text, borderRadius: 6, padding: '2px 9px', fontWeight: 700, fontSize: 12 })

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>♟</div>
        <div style={{ fontWeight:700, fontSize:18, color:'#1e293b' }}>Loading Chessboard HR…</div>
        <div style={{ color:'#94a3b8', marginTop:6 }}>Connecting to database</div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:'DM Sans,Segoe UI,sans-serif', background:'#f8fafc', minHeight:'100vh', color:'#1e293b' }}>
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, background: toast.type==='ok'?'#0f172a':'#dc2626', color:'#fff', padding:'10px 20px', borderRadius:10, fontWeight:600, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'0 28px', boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
        <div style={{ maxWidth:1440, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:62 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, background:'linear-gradient(135deg,#3b82f6,#06b6d4)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>♟</div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:17 }}>Chessboard Co. <span style={{ fontWeight:400, opacity:0.5, fontSize:13 }}>HR System</span></div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            {saving && <span style={{ fontSize:12, color:'#60a5fa' }}>Saving…</span>}
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: dbConnected?'#22c55e':'#f59e0b' }}/>
              <span style={{ color:'#94a3b8' }}>{dbConnected ? 'Supabase connected' : 'Local mode'}</span>
            </div>
            <nav style={{ display:'flex', gap:3 }}>
              {TABS.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding:'7px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, background: activeTab===tab?'rgba(59,130,246,0.25)':'transparent', color: activeTab===tab?'#93c5fd':'#94a3b8', outline: activeTab===tab?'1px solid rgba(59,130,246,0.4)':'none' }}>{tab}</button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1440, margin:'0 auto', padding:'24px 28px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => navMonth(-1)} style={{ width:34, height:34, borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:18, color:'#64748b' }}>‹</button>
            <div style={{ fontSize:20, fontWeight:800, color:'#0f172a', minWidth:190, textAlign:'center' }}>{MONTHS[month]} {year}</div>
            <button onClick={() => navMonth(1)} style={{ width:34, height:34, borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:18, color:'#64748b' }}>›</button>
          </div>
          <div style={{ fontSize:13, color:'#94a3b8' }}>{employees.length} employees · {daysInMonth} days</div>
        </div>

        {activeTab === 'Dashboard' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
              {[
                { label:'Total Employees',   value: employees.length,       icon:'👥', color:'#3b82f6', bg:'#eff6ff' },
                { label:'Present This Month', value: totals.P,              icon:'✅', color:'#22c55e', bg:'#f0fdf4' },
                { label:'Absent + On Leave',  value: totals.A + totals.L,   icon:'❌', color:'#ef4444', bg:'#fef2f2' },
                { label:'Earned Till Date',   value:'₹'+fmt(totals.earned), icon:'📈', color:'#7c3aed', bg:'#f5f3ff' },
              ].map(k => (
                <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.color}22`, borderRadius:14, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ fontSize:30 }}>{k.icon}</div>
                  <div>
                    <div style={{ fontSize:23, fontWeight:800, color:k.color }}>{k.value}</div>
                    <div style={{ fontSize:12, color:'#64748b', fontWeight:500 }}>{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14 }}>📊 Summary — {MONTHS[month]} {year}</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Employee','Designation','P','A','L','H','Att%','Monthly','Deduction','Net Payable','Earned Till Date'].map(h => (
                        <th key={h} style={{ ...hdr(['Monthly','Deduction','Net Payable','Earned Till Date'].includes(h)), ...(['Employee','Designation'].includes(h)?{}:{ textAlign: ['Monthly','Deduction','Net Payable','Earned Till Date'].includes(h)?'right':'center' as any }) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {empStats.map((e, i) => (
                      <tr key={e.id} style={{ background: i%2===0?'#fff':'#fafafa' }}>
                        <td style={cell}><div style={{ fontWeight:600 }}>{e.name}</div><div style={{ fontSize:11,color:'#94a3b8' }}>{e.id}</div></td>
                        <td style={{ ...cell, color:'#64748b' }}>{e.designation}</td>
                        {(['P','A','L','H'] as Status[]).map(k => <td key={k} style={{ ...cell, textAlign:'center' }}><span style={badge(STATUS_META[k].bg, STATUS_META[k].text)}>{e[k]}</span></td>)}
                        <td style={{ ...cell, textAlign:'center', fontWeight:700, color: e.attPct>=90?'#22c55e':e.attPct>=75?'#eab308':'#ef4444' }}>{e.attPct}%</td>
                        <td style={{ ...cell, textAlign:'right', color:'#64748b' }}>₹{fmt(e.monthly_salary)}</td>
                        <td style={{ ...cell, textAlign:'right', color:'#ef4444', fontWeight:600 }}>{e.deduction>0?`-₹${fmt(e.deduction)}`:'—'}</td>
                        <td style={{ ...cell, textAlign:'right', fontWeight:700 }}>₹{fmt(e.finalSal)}</td>
                        <td style={{ ...cell, textAlign:'right' }}><div style={{ fontWeight:800, color:'#7c3aed' }}>₹{fmt(e.earned)}</div><div style={{ fontSize:10, color:'#94a3b8' }}>{e.earnedDays}d (P+H)</div></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#0f172a', color:'#fff' }}>
                      <td colSpan={2} style={{ padding:'12px 14px', fontWeight:700 }}>TOTALS</td>
                      <td style={{ padding:'12px 14px', textAlign:'center', color:'#86efac', fontWeight:700 }}>{totals.P}</td>
                      <td style={{ padding:'12px 14px', textAlign:'center', color:'#fca5a5', fontWeight:700 }}>{totals.A}</td>
                      <td style={{ padding:'12px 14px', textAlign:'center', color:'#fde047', fontWeight:700 }}>{totals.L}</td>
                      <td style={{ padding:'12px 14px', textAlign:'center', color:'#d1d5db', fontWeight:700 }}>{totals.H}</td>
                      <td/>
                      <td style={{ padding:'12px 14px', textAlign:'right', color:'#cbd5e1', fontWeight:700 }}>₹{fmt(totals.salary)}</td>
                      <td style={{ padding:'12px 14px', textAlign:'right', color:'#fca5a5', fontWeight:700 }}>-₹{fmt(totals.deduction)}</td>
                      <td style={{ padding:'12px 14px', textAlign:'right', color:'#86efac', fontWeight:800 }}>₹{fmt(totals.finalSal)}</td>
                      <td style={{ padding:'12px 14px', textAlign:'right', color:'#c4b5fd', fontWeight:800 }}>₹{fmt(totals.earned)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Attendance' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {(Object.entries(STATUS_META) as [Status, typeof STATUS_META[Status]][]).map(([k, m]) => (
                  <span key={k} style={{ background:m.bg, color:m.text, border:`1px solid ${m.border}`, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600 }}>{k} = {m.label}</span>
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:'#64748b' }}>Bulk fill day:</span>
                {(['P','A','L','H'] as Status[]).map(s2 => (
                  <button key={s2} onClick={() => setBulkStatus(s2)} style={{ width:30, height:30, borderRadius:6, border:`2px solid ${bulkStatus===s2?STATUS_META[s2].text:STATUS_META[s2].border}`, background: bulkStatus===s2?STATUS_META[s2].bg:'#fff', color:STATUS_META[s2].text, fontWeight:700, cursor:'pointer', fontSize:13 }}>{s2}</button>
                ))}
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#0f172a' }}>
                      <th style={{ padding:'10px 14px', color:'#94a3b8', fontWeight:600, fontSize:11, minWidth:160, position:'sticky', left:0, background:'#0f172a', zIndex:2, textAlign:'left' }}>Employee</th>
                      <th style={{ padding:'10px 8px', color:'#94a3b8', fontWeight:600, fontSize:10, minWidth:72, position:'sticky', left:160, background:'#0f172a', zIndex:2 }}>Fill All</th>
                      {Array.from({ length: daysInMonth }, (_,i) => i+1).map(d => {
                        const wd = getDOW(year, month, d); const we = wd===0||wd===6
                        return (
                          <th key={d} style={{ padding:'4px 2px', textAlign:'center', minWidth:32 }}>
                            <div style={{ fontSize:9, color: we?'#60a5fa':'#64748b', marginBottom:2 }}>{WEEKDAYS[wd]}</div>
                            <button onClick={() => fillDay(d, bulkStatus)} style={{ width:28, height:28, borderRadius:6, border:'1px solid #334155', background:'#1e293b', color: we?'#60a5fa':'#94a3b8', fontWeight:700, cursor:'pointer', fontSize:12 }}>{d}</button>
                          </th>
                        )
                      })}
                      {['P','A','L','H','%'].map(h => <th key={h} style={{ padding:'10px 8px', textAlign:'center', color:'#94a3b8', fontWeight:700, fontSize:12, minWidth:44 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {empStats.map((emp, ei) => {
                      const rowBg = ei%2===0?'#fff':'#f8fafc'
                      return (
                        <tr key={emp.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'8px 14px', position:'sticky', left:0, background:rowBg, zIndex:1, borderRight:'1px solid #e2e8f0' }}>
                            <div style={{ fontWeight:600, fontSize:13 }}>{emp.name}</div>
                            <div style={{ fontSize:10, color:'#94a3b8' }}>{emp.designation}</div>
                          </td>
                          <td style={{ padding:'6px 8px', position:'sticky', left:160, background:rowBg, zIndex:1, borderRight:'1px solid #e2e8f0' }}>
                            <div style={{ display:'flex', gap:3 }}>
                              {(['P','A','L','H'] as Status[]).map(s2 => (
                                <button key={s2} onClick={() => fillAll(emp.id, s2)} style={{ width:18, height:18, borderRadius:4, border:`1px solid ${STATUS_META[s2].border}`, background:STATUS_META[s2].bg, color:STATUS_META[s2].text, fontWeight:700, cursor:'pointer', fontSize:9, padding:0 }}>{s2}</button>
                              ))}
                            </div>
                          </td>
                          {Array.from({ length: daysInMonth }, (_,i) => i+1).map(d => {
                            const st = getStatus(emp.id, d) as Status | ''
                            const we = isWeekend(year, month, d)
                            return (
                              <td key={d} style={{ padding:'2px', textAlign:'center', background: we?'#f0f9ff':rowBg }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                                  {(['P','A','L','H'] as Status[]).map(opt => (
                                    <button key={opt} onClick={() => setStatus(emp.id, d, opt)} style={{ width:26, height:13, borderRadius:3, border: st===opt?`1.5px solid ${STATUS_META[opt].text}`:`1px solid ${we?'#bfdbfe':'#e2e8f0'}`, background: st===opt?STATUS_META[opt].bg:we?'#eff6ff':'#fff', color: st===opt?STATUS_META[opt].text:'#cbd5e1', fontWeight:700, cursor:'pointer', fontSize:8, padding:0 }}>{opt}</button>
                                  ))}
                                </div>
                              </td>
                            )
                          })}
                          {(['P','A','L','H'] as Status[]).map(k => <td key={k} style={{ padding:'8px 4px', textAlign:'center' }}><span style={badge(STATUS_META[k].bg, STATUS_META[k].text)}>{emp[k]}</span></td>)}
                          <td style={{ padding:'8px 4px', textAlign:'center', fontWeight:700, fontSize:12, color: emp.attPct>=90?'#22c55e':emp.attPct>=75?'#eab308':'#ef4444' }}>{emp.attPct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Payroll' && (
          <div>
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:700, fontSize:14 }}>💰 Payroll — {MONTHS[month]} {year}</div>
                <div style={{ fontSize:12, color:'#64748b', background:'#f1f5f9', padding:'4px 12px', borderRadius:20 }}>Per Day = Monthly ÷ 26 · Deduction = (A+L) × Per Day · H = Paid</div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['#','Employee','Designation','Monthly','Per Day','P','A','L (Unpaid)','H (Paid)','Payable Days','Deduction','Net Salary','Earned Till Date'].map(h => (
                        <th key={h} style={hdr(['Monthly','Per Day','Deduction','Net Salary','Earned Till Date'].includes(h))}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {empStats.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ ...cell, textAlign:'center', color:'#94a3b8', fontWeight:600 }}>{i+1}</td>
                        <td style={cell}><div style={{ fontWeight:600 }}>{e.name}</div><div style={{ fontSize:11, color:'#94a3b8' }}>{e.id}</div></td>
                        <td style={{ ...cell, color:'#64748b' }}>{e.designation}</td>
                        <td style={{ ...cell, textAlign:'right', fontWeight:600 }}>₹{fmt(e.monthly_salary)}</td>
                        <td style={{ ...cell, textAlign:'right', color:'#64748b' }}>₹{e.perDay.toFixed(2)}</td>
                        <td style={{ ...cell, textAlign:'center' }}><span style={badge('#dcfce7','#15803d')}>{e.P}</span></td>
                        <td style={{ ...cell, textAlign:'center' }}><span style={badge(e.A>0?'#fee2e2':'#f1f5f9',e.A>0?'#dc2626':'#94a3b8')}>{e.A}</span></td>
                        <td style={{ ...cell, textAlign:'center' }}><span style={badge(e.L>0?'#fef9c3':'#f1f5f9',e.L>0?'#ca8a04':'#94a3b8')}>{e.L}</span></td>
                        <td style={{ ...cell, textAlign:'center' }}><span style={badge('#f3f4f6','#6b7280')}>{e.H}</span></td>
                        <td style={{ ...cell, textAlign:'center', fontWeight:600 }}>{e.P + e.H}</td>
                        <td style={{ ...cell, textAlign:'right', color: e.deduction>0?'#ef4444':'#94a3b8', fontWeight:600 }}>{e.deduction>0?`-₹${fmt(e.deduction)}`:'—'}</td>
                        <td style={{ ...cell, textAlign:'right' }}><span style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', color:'#fff', borderRadius:8, padding:'4px 12px', fontWeight:800, fontSize:13 }}>₹{fmt(e.finalSal)}</span></td>
                        <td style={{ ...cell, textAlign:'right' }}><div style={{ fontWeight:800, color:'#7c3aed' }}>₹{fmt(e.earned)}</div><div style={{ fontSize:10, color:'#94a3b8' }}>{e.earnedDays}d (P+H)</div></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#0f172a' }}>
                      <td colSpan={3} style={{ padding:'13px 14px', color:'#fff', fontWeight:700 }}>TOTALS — {employees.length} employees</td>
                      <td style={{ padding:'13px 14px', textAlign:'right', color:'#93c5fd', fontWeight:700 }}>₹{fmt(totals.salary)}</td>
                      <td/><td style={{ padding:'13px', textAlign:'center', color:'#86efac', fontWeight:700 }}>{totals.P}</td>
                      <td style={{ padding:'13px', textAlign:'center', color:'#fca5a5', fontWeight:700 }}>{totals.A}</td>
                      <td style={{ padding:'13px', textAlign:'center', color:'#fde047', fontWeight:700 }}>{totals.L}</td>
                      <td style={{ padding:'13px', textAlign:'center', color:'#d1d5db', fontWeight:700 }}>{totals.H}</td>
                      <td/>
                      <td style={{ padding:'13px 14px', textAlign:'right', color:'#fca5a5', fontWeight:700 }}>-₹{fmt(totals.deduction)}</td>
                      <td style={{ padding:'13px 14px', textAlign:'right', color:'#86efac', fontWeight:800, fontSize:15 }}>₹{fmt(totals.finalSal)}</td>
                      <td style={{ padding:'13px 14px', textAlign:'right', color:'#c4b5fd', fontWeight:800 }}>₹{fmt(totals.earned)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1d4ed8' }}>
              📌 <strong>Logic:</strong> Per Day = Salary ÷ 26 · Deduction = (A+L) × Per Day · <strong>Leave = Unpaid · Holiday = Paid</strong> · Earned Till Date = (P+H) × Per Day
            </div>
          </div>
        )}

        {activeTab === 'Employees' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>👥 Employee Master</div>
              <button onClick={() => setAddingEmp(!addingEmp)} style={{ background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                {addingEmp ? '✕ Cancel' : '+ Add Employee'}
              </button>
            </div>
            {addingEmp && (
              <div style={{ background:'#fff', border:'1px solid #bfdbfe', borderRadius:12, padding:20, marginBottom:16, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                {[{ label:'Full Name *', key:'name', placeholder:'e.g. Rahul Sharma' },{ label:'Designation', key:'designation', placeholder:'e.g. Developer' },{ label:'Monthly Salary (₹) *', key:'salary', placeholder:'e.g. 25000', type:'number' }].map(f => (
                  <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <label style={{ fontSize:11, fontWeight:600, color:'#64748b' }}>{f.label}</label>
                    <input type={f.type||'text'} placeholder={f.placeholder} value={(newEmp as any)[f.key]} onChange={e => setNewEmp(p => ({ ...p, [f.key]: e.target.value }))} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, outline:'none', width:180 }} />
                  </div>
                ))}
                <button onClick={addEmployee} style={{ background:'#22c55e', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:13 }}>✓ Add</button>
              </div>
            )}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0f172a' }}>
                    {['Emp ID','Name','Designation','Joining Date','Monthly Salary','Per Day','Att % (This Month)'].map(h => (
                      <th key={h} style={{ padding:'12px 16px', textAlign: ['Monthly Salary','Per Day'].includes(h)?'right':'left', color:'#94a3b8', fontWeight:600, fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empStats.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ ...cell, fontWeight:700, color:'#3b82f6', fontSize:12 }}>{e.id}</td>
                      <td style={{ ...cell, fontWeight:600 }}>{e.name}</td>
                      <td style={{ ...cell, color:'#64748b' }}>{e.designation}</td>
                      <td style={{ ...cell, color:'#64748b' }}>{e.joining_date}</td>
                      <td style={{ ...cell, textAlign:'right', fontWeight:600 }}>₹{fmt(e.monthly_salary)}</td>
                      <td style={{ ...cell, textAlign:'right', color:'#64748b' }}>₹{e.perDay.toFixed(2)}</td>
                      <td style={cell}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, background:'#f1f5f9', borderRadius:99, height:6, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${e.attPct}%`, background: e.attPct>=90?'#22c55e':e.attPct>=75?'#eab308':'#ef4444', borderRadius:99 }} />
                          </div>
                          <span style={{ fontWeight:700, fontSize:12, color: e.attPct>=90?'#22c55e':e.attPct>=75?'#eab308':'#ef4444', minWidth:36 }}>{e.attPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!dbConnected && (
          <div style={{ marginTop:24, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'14px 18px', fontSize:13, color:'#92400e' }}>
            ⚠️ <strong>Running in local mode.</strong> Data resets on refresh. See <code>README.md</code> to connect Supabase for persistent cloud storage.
          </div>
        )}
      </div>
    </div>
  )
}

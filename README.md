# ♟ Chessboard Co. HR System

Attendance tracking + payroll calculation web app.

---

## 🚀 Deploy in 3 Steps

### Step 1 — Set up Supabase (free, 5 mins)

1. Go to [supabase.com](https://supabase.com) → Create account → New Project
2. Go to **SQL Editor** and run this:

```sql
-- Employees table
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  designation TEXT,
  joining_date DATE,
  monthly_salary NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,
  day INT NOT NULL,
  status TEXT CHECK (status IN ('P','A','L','H')) NOT NULL,
  UNIQUE(employee_id, year, month, day)
);

-- Allow public access (anon key)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON attendance FOR ALL USING (true) WITH CHECK (true);
```

3. Go to **Settings → API** → copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

---

### Step 2 — Deploy to Vercel (free, 2 mins)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → Import repo
3. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Click **Deploy** ✓

---

### Step 3 — Done!

Your app is live at `https://your-app.vercel.app`

Data is stored in Supabase and persists forever.
All team members can access the same data in real time.

---

## 💻 Run Locally

```bash
cp .env.example .env
# Fill in your Supabase credentials in .env

pnpm install
pnpm dev
```

---

## 📊 Salary Logic

| Status | Deduction? | Counts in Earned Till Date? |
|--------|-----------|----------------------------|
| P — Present | ❌ No | ✅ Yes |
| H — Holiday | ❌ No | ✅ Yes |
| A — Absent  | ✅ Yes | ❌ No |
| L — Leave   | ✅ Yes (Unpaid) | ❌ No |

- **Per Day Salary** = Monthly ÷ 26
- **Deduction** = (Absent + Leave) × Per Day
- **Net Salary** = Monthly − Deduction
- **Earned Till Date** = (Present + Holiday) × Per Day (up to today)

---

## 🛠 Tech Stack

- React 18 + TypeScript + Vite
- Supabase (PostgreSQL backend)
- Vercel (hosting)
- Zero external UI libraries (custom styling)

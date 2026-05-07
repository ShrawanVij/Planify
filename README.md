# Planify-Project Management App

A lightweight but capable project management tool built with Node.js, Express, and PostgreSQL. Planify lets teams organize work into projects, assign tasks, track progress, and manage who has access to what — all through a clean web interface.

---

## What It Does

At its core, Planify is about keeping teams organized. Admins can spin up projects, add team members, and create tasks with priorities and due dates. Members can see their assigned work, update task statuses, and collaborate within the projects they belong to. Everything runs behind JWT authentication so only the right people see the right things.

**Key features:**
- User registration and login with secure password hashing (bcrypt)
- Role-based access-`admin` users manage everything, `member` users work within their assigned projects
- Full project lifecycle management: create, update, archive, or delete projects
- Task tracking with statuses (`todo`, `in_progress`, `review`, `done`) and priorities (`low`, `medium`, `high`, `urgent`)
- Task assignment, due dates, and filtering by status/priority
- Dashboard with aggregated stats per project (member count, task count, completion rate)
- Automatic database setup on first run-no manual SQL required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (v18+) |
| Framework | Express.js |
| Database | PostgreSQL |
| Auth | JSON Web Tokens (JWT) |
| Password Hashing | bcryptjs |
| Frontend | Vanilla HTML/CSS/JS (served as static files) |
| Deployment | Railway |

---

## Getting Started

### Prerequisites

- Node.js v18 or higher
- A running PostgreSQL database

### Local Setup

1. **Clone the repo and install dependencies**

   ```bash
   git clone <your-repo-url>
   cd project-manager
   npm install
   ```

2. **Set up your environment variables**

   ```bash
   cp .env.example .env
   ```

   Then open `.env` and fill in your values:

   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/planify
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   NODE_ENV=development
   PORT=3000
   ```

3. **Start the server**

   ```bash
   # Development (auto-restarts on file changes)
   npm run dev

   # Production
   npm start
   ```

   On startup, the app automatically creates all the necessary database tables if they don't exist yet. You'll see a confirmation in the console once it's ready.

4. **Open the app**

   Navigate to `http://localhost:3000` in your browser.

---

## Deploying to Railway

This project includes a `railway.toml` config file, so deployment is straightforward.

1. Push your code to a GitHub repository
2. Create a new project on [Railway](https://railway.app)
3. Add a **PostgreSQL** plugin to your Railway project — Railway will automatically set the `DATABASE_URL` environment variable
4. Add your `JWT_SECRET` as an environment variable in the Railway dashboard
5. Deploy-Railway will detect the Node.js app and run `npm start`

That's it. The database tables get created automatically on the first boot.

---

## Project Structure

```
project-manager/
├── server.js              # Entry point — sets up Express and starts the server
├── db.js                  # PostgreSQL connection pool and database initialization
├── middleware/
│   └── auth.js            # JWT authentication, admin guard, project access checks
├── routes/
│   ├── auth.js            # Signup, login, and current user endpoints
│   ├── projects.js        # Project CRUD and member management
│   ├── tasks.js           # Task CRUD, status updates, and filtering
│   ├── dashboard.js       # Aggregated stats for the dashboard view
│   └── users.js           # User listing (for assigning tasks, etc.)
├── public/
│   └── index.html         # Frontend — single-page app served statically
├── .env.example           # Template for environment variables
├── railway.toml           # Railway deployment config
└── package.json
```

---

## API Overview

All API routes are prefixed with `/api`. Protected routes require a `Bearer <token>` header.

### Auth

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Log in and receive a JWT |
| GET | `/api/auth/me` | Get the currently authenticated user |

### Projects *(requires auth)*

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/projects` | All | List projects (admins see all, members see their own) |
| POST | `/api/projects` | Admin | Create a new project |
| GET | `/api/projects/:id` | Member+ | Get project details, members, and tasks |
| PUT | `/api/projects/:id` | Admin | Update project name, description, or status |
| DELETE | `/api/projects/:id` | Admin | Delete a project |
| POST | `/api/projects/:id/members` | Admin | Add a user to a project |
| DELETE | `/api/projects/:id/members/:userId` | Admin | Remove a user from a project |

### Tasks *(requires auth)*

| Method | Route | Description |
|---|---|---|
| GET | `/api/tasks` | List tasks (filterable by project, status, priority, assignee) |
| POST | `/api/tasks` | Create a task |
| PUT | `/api/tasks/:id` | Update a task |
| PATCH | `/api/tasks/:id/status` | Quick status update |
| DELETE | `/api/tasks/:id` | Delete a task (admin or task creator only) |

### Other

| Method | Route | Description |
|---|---|---|
| GET | `/api/dashboard` | Stats summary for the current user |
| GET | `/api/users` | List all users (for task assignment dropdowns) |
| GET | `/api/health` | Health check — returns `{ status: "ok" }` |

---

## Database Schema

The app uses four tables that are created automatically:

- **users** — stores account info and system role (`admin` or `member`)
- **projects** — project records with owner reference and status
- **project_members** — many-to-many join between users and projects, with a per-project role
- **tasks** — task records linked to a project, with assignee, priority, status, and due date

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for signing JWTs — keep this private |
| `NODE_ENV` | No | Set to `production` to enable SSL for the DB connection |
| `PORT` | No | Port to run the server on (defaults to 3000) |

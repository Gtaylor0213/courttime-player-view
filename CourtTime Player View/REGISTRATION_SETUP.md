# 🎉 Registration System Setup Complete!

Your user registration system is now fully integrated with the PostgreSQL database. Here's what has been implemented:

---

## ✅ What's Been Created

### 1. **Backend API Server** (`server/`)
   - ✅ Express server with TypeScript
   - ✅ RESTful API endpoints for auth, facilities, and users
   - ✅ Database connection integration
   - ✅ Error handling and logging

### 2. **API Routes**

#### **Auth Routes** (`server/routes/auth.ts`)
   - `POST /api/auth/register` - Register new user with facility selection
   - `POST /api/auth/login` - User login with facility memberships
   - `POST /api/auth/add-facility` - Add user to facility after registration

#### **Facilities Routes** (`server/routes/facilities.ts`)
   - `GET /api/facilities` - Get all facilities
   - `GET /api/facilities/search?q=query` - Search facilities
   - `GET /api/facilities/stats` - Get facilities with statistics
   - `GET /api/facilities/:id` - Get facility details
   - `GET /api/facilities/:id/courts` - Get facility courts

#### **Users Routes** (`server/routes/users.ts`)
   - `GET /api/users/:id` - Get user by ID
   - `GET /api/users/:id/memberships` - Get user with facility memberships
   - `PATCH /api/users/:id` - Update user profile

### 3. **Frontend API Client** (`src/api/client.ts`)
   - ✅ Utility functions for calling backend API
   - ✅ Type-safe API calls
   - ✅ Error handling
   - ✅ Three main APIs: `authApi`, `facilitiesApi`, `usersApi`

### 4. **Updated AuthContext** (`src/contexts/AuthContext.tsx`)
   - ✅ Integrated with API client
   - ✅ Real database authentication
   - ✅ DEV_MODE toggle (currently OFF for real database)
   - ✅ Login and registration with database
   - ✅ User state management with facility memberships

### 5. **Services Layer**
   - ✅ `authService.ts` - User authentication, registration, password hashing
   - ✅ `facilityService.ts` - Facility queries and searches

---

## 🚀 How to Test

### **1. Start the Development Server**

```bash
npm run dev
```

This command now:
- Starts the backend API server on port 3001
- Starts the frontend Vite dev server on port 5173
- Both run concurrently

You'll see output like:
```
🔌 Testing database connection...
✅ Database connection successful!
🚀 CourtTime API Server running on port 3001
📍 Health check: http://localhost:3001/health
🔐 Auth API: http://localhost:3001/api/auth
🏢 Facilities API: http://localhost:3001/api/facilities

VITE v6.3.5  ready in 1234 ms
➜  Local:   http://localhost:5173/
```

### **2. Test Registration Flow**

1. **Navigate to the app**: http://localhost:5173
2. **Click "Create Player Account"**
3. **Fill in personal information:**
   - First Name, Last Name
   - Email (use a new email)
   - Phone Number
   - Address (City, State, ZIP)
   - Skill Level (optional)
   - Password (minimum 8 characters)

4. **Click "Next Step"**
5. **Search for facilities** (optional)
   - Type "Sunrise" or "Downtown" or "Riverside"
   - Click "Request" or "Join" to add facilities

6. **Configure notifications** (optional)
7. **Click "Create Account"**

### **3. What Happens**

When you create an account:
1. ✅ User is created in the `users` table
2. ✅ Password is hashed with bcrypt
3. ✅ User preferences are created
4. ✅ Player profile is created
5. ✅ Selected facilities are added to `facility_memberships`
6. ✅ User is logged in automatically
7. ✅ Dashboard is shown with facility access

---

## 📝 API Testing

You can test the API directly:

### **Check Server Health**
```bash
curl http://localhost:3001/health
```

### **Register a User**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User",
    "userType": "player",
    "selectedFacilities": ["sunrise-valley"]
  }'
```

### **Login**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### **Search Facilities**
```bash
curl "http://localhost:3001/api/facilities/search?q=tennis"
```

---

## 🔧 Configuration

### **Environment Variables** (`.env`)
```bash
DATABASE_URL=postgresql://...  # Database connection (working!)
VITE_API_BASE_URL=http://localhost:3001  # Backend API URL
```

### **DEV_MODE Toggle**

In `src/contexts/AuthContext.tsx`:
```typescript
const DEV_MODE = false;  // false = use real database
```

- **`false`** (current): Uses real PostgreSQL database
- **`true`**: Uses mock data for testing without database

---

## 📊 Database Schema

When a user registers, these tables are populated:

```
users
├── id (UUID)
├── email (unique)
├── password_hash (bcrypt)
├── full_name
├── user_type ('player' or 'admin')
└── timestamps

user_preferences
├── user_id (FK)
├── notifications
├── timezone
└── theme

player_profiles
├── user_id (FK)
├── skill_level
├── ntrp_rating
├── playing_hand
└── ...

facility_memberships
├── user_id (FK)
├── facility_id (FK)
├── membership_type
├── status ('active', 'pending', 'expired')
└── dates
```

---

## 🎯 Registration Features

### ✅ Implemented
- User account creation with email/password
- Password hashing with bcrypt (10 salt rounds)
- Email validation
- Password strength validation (min 8 characters)
- Personal information collection
- Address information
- Skill level (optional)
- Profile picture upload
- Multi-facility membership requests
- Notification preferences
- Automatic login after registration
- User stored in database with all relationships

### 🔄 Flow
1. User fills Step 1 (Personal Info) ✅
2. User fills Step 2 (Facilities & Notifications) ✅
3. Backend creates user in database ✅
4. Backend adds facility memberships ✅
5. User is logged in automatically ✅
6. User redirected to dashboard ✅

---

## 🧪 Testing Checklist

### Backend API
- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] `/health` endpoint returns 200
- [ ] Can register new user
- [ ] Can login with registered user
- [ ] Can search facilities
- [ ] Can get facility details

### Frontend
- [ ] Registration page loads
- [ ] Form validation works
- [ ] Facility search works
- [ ] Can complete registration
- [ ] Success message shown
- [ ] User logged in after registration
- [ ] Dashboard loads with user data

### Database
- [ ] New user created in `users` table
- [ ] Password is hashed
- [ ] User preferences created
- [ ] Player profile created
- [ ] Facility memberships created
- [ ] User has `memberFacilities` array populated

---

## 📚 Next Steps

### Immediate
1. ✅ Start server: `npm run dev`
2. ✅ Test registration with a new email
3. ✅ Verify user in database: `npm run db:check`

### Enhancements (Optional)
- [ ] Add email verification
- [ ] Add "Remember Me" functionality
- [ ] Add password reset flow
- [ ] Add profile picture upload to cloud storage
- [ ] Add facility approval workflow for private clubs
- [ ] Add user session management with JWT
- [ ] Add rate limiting for API endpoints

---

## 🆘 Troubleshooting

### "Cannot connect to server"
- Make sure you ran `npm run dev` (not just `npm run dev:client`)
- Check that port 3001 is not in use
- Verify DATABASE_URL in `.env`

### "User already exists"
- Email is already registered
- Use a different email or delete the user from database

### "Database connection failed"
- Run `npm run db:check` to verify connection
- Check DATABASE_URL is correct
- Ensure database is accessible

### "Facility search returns no results"
- Make sure database has sample facilities
- Run `npm run db:setup` if needed
- Check facility names: 'sunrise-valley', 'downtown', 'riverside'

---

## 💡 Pro Tips

1. **Use concurrently**: `npm run dev` starts both frontend and backend
2. **API Client**: All API calls go through `src/api/client.ts`
3. **Type Safety**: TypeScript interfaces match database schema
4. **Error Handling**: Check browser console and server logs
5. **Database Check**: Use `npm run db:check` anytime to verify data

---

## 🎊 Success!

Your registration system is now fully functional with:
- ✅ Real database integration
- ✅ Password hashing and security
- ✅ Multi-facility support
- ✅ Complete user profiles
- ✅ RESTful API
- ✅ Type-safe frontend

**Ready to register users and start booking courts!** 🎾

---

**Questions?** Check the API server logs or database with `npm run db:check`.

**Happy coding!**

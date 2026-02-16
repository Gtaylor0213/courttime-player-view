-- CourtTime Tennis Court Management System Database Schema
-- Generated for PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('player', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notifications BOOLEAN DEFAULT true,
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    theme VARCHAR(20) DEFAULT 'light',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FACILITIES & COURTS
-- =====================================================

CREATE TABLE facilities (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100), -- e.g., 'HOA Tennis & Pickleball Courts', 'Tennis Club'
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    description TEXT,
    amenities TEXT[], -- Array of amenities
    operating_hours JSONB, -- JSON object with hours for each day
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    court_number INTEGER,
    surface_type VARCHAR(50), -- e.g., 'Hard', 'Clay', 'Grass', 'Synthetic'
    court_type VARCHAR(50), -- e.g., 'Tennis', 'Pickleball', 'Dual'
    is_indoor BOOLEAN DEFAULT false,
    has_lights BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- MEMBERSHIPS
-- =====================================================

CREATE TABLE facility_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    membership_type VARCHAR(50), -- e.g., 'Full', 'Social', 'Junior'
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'suspended')),
    start_date DATE NOT NULL,
    end_date DATE,
    suspended_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, facility_id)
);

-- =====================================================
-- BOOKINGS
-- =====================================================

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled', 'completed')),
    booking_type VARCHAR(50), -- e.g., 'singles', 'doubles', 'lesson', 'practice'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_court ON bookings(court_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);

-- =====================================================
-- HITTING PARTNER POSTS
-- =====================================================

CREATE TABLE hitting_partner_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    skill_level VARCHAR(50), -- e.g., 'Beginner', 'Intermediate', 'Advanced', 'Professional'
    availability TEXT NOT NULL,
    play_style TEXT[], -- Array of play styles: 'Singles', 'Doubles', 'Competitive', 'Social', 'Drills', 'Match Play', 'Learning'
    description TEXT NOT NULL,
    posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hitting_partner_posts_facility ON hitting_partner_posts(facility_id);
CREATE INDEX idx_hitting_partner_posts_status ON hitting_partner_posts(status);
CREATE INDEX idx_hitting_partner_posts_expires ON hitting_partner_posts(expires_at);

-- =====================================================
-- BULLETIN BOARD
-- =====================================================

CREATE TABLE bulletin_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50), -- e.g., 'Announcement', 'Event', 'Social', 'Maintenance'
    is_pinned BOOLEAN DEFAULT false,
    is_admin_post BOOLEAN DEFAULT false,
    posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bulletin_posts_facility ON bulletin_posts(facility_id);
CREATE INDEX idx_bulletin_posts_date ON bulletin_posts(posted_date DESC);

-- =====================================================
-- EVENTS
-- =====================================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50), -- e.g., 'Tournament', 'Social', 'Lesson', 'Clinic'
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    registration_deadline TIMESTAMP,
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'waitlist', 'cancelled')),
    UNIQUE(event_id, user_id)
);

-- =====================================================
-- LEAGUES & RANKINGS
-- =====================================================

CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    league_type VARCHAR(50), -- e.g., 'Singles', 'Doubles', 'Mixed Doubles'
    skill_level VARCHAR(50), -- e.g., 'Beginner', 'Intermediate', 'Advanced'
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE league_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    ranking INTEGER,
    joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, user_id)
);

-- =====================================================
-- PLAYER PROFILES
-- =====================================================

CREATE TABLE player_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    skill_level VARCHAR(50), -- e.g., 'Beginner', 'Intermediate', 'Advanced', 'Professional'
    ntrp_rating DECIMAL(2,1), -- NTRP rating (2.5, 3.0, 3.5, etc.)
    playing_hand VARCHAR(10), -- 'Right', 'Left', 'Both'
    playing_style VARCHAR(50), -- 'Baseline', 'Serve & Volley', 'All-Court'
    preferred_court_surface VARCHAR(50),
    bio TEXT,
    profile_image_url TEXT,
    years_playing INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50), -- e.g., 'booking', 'event', 'message', 'system'
    is_read BOOLEAN DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- =====================================================
-- MESSAGES (for hitting partner connections)
-- =====================================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) REFERENCES facilities(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_conversation UNIQUE (participant1_id, participant2_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_conversations_facility ON conversations(facility_id);

-- =====================================================
-- EMAIL TEMPLATES
-- =====================================================

CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    template_type VARCHAR(50) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, template_type)
);

CREATE INDEX idx_email_templates_facility ON email_templates(facility_id);
CREATE INDEX idx_email_templates_type ON email_templates(template_type);

-- =====================================================
-- ANALYTICS & USAGE TRACKING
-- =====================================================

CREATE TABLE booking_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    total_bookings INTEGER DEFAULT 0,
    total_hours DECIMAL(10,2) DEFAULT 0,
    peak_hours JSONB, -- JSON object with peak usage hours
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE facility_usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    total_members INTEGER,
    active_members INTEGER,
    new_members INTEGER,
    total_bookings INTEGER,
    total_hours_booked DECIMAL(10,2),
    revenue DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, stat_date)
);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_facilities_updated_at BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courts_updated_at BEFORE UPDATE ON courts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hitting_partner_posts_updated_at BEFORE UPDATE ON hitting_partner_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bulletin_posts_updated_at BEFORE UPDATE ON bulletin_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_profiles_updated_at BEFORE UPDATE ON player_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-expire hitting partner posts
CREATE OR REPLACE FUNCTION expire_old_hitting_partner_posts()
RETURNS void AS $$
BEGIN
    UPDATE hitting_partner_posts
    SET status = 'expired'
    WHERE expires_at < CURRENT_TIMESTAMP AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_facilities_name ON facilities(name);
CREATE INDEX idx_courts_facility ON courts(facility_id);
CREATE INDEX idx_facility_memberships_user ON facility_memberships(user_id);
CREATE INDEX idx_facility_memberships_facility ON facility_memberships(facility_id);
CREATE INDEX idx_facility_memberships_status ON facility_memberships(status);

-- =====================================================
-- SAMPLE DATA (for development)
-- =====================================================

-- Insert sample facilities
INSERT INTO facilities (id, name, type, description) VALUES
('sunrise-valley', 'Sunrise Valley HOA', 'HOA Tennis & Pickleball Courts', 'Community tennis and pickleball courts'),
('downtown', 'Downtown Tennis Center', 'Tennis Club', 'Premier tennis facility in downtown'),
('riverside', 'Riverside Tennis Club', 'Tennis Club', 'Exclusive riverside tennis club'),
('mountain-view', 'Mountain View Racquet Club', 'Racquet Club', 'Full-service racquet club'),
('lakeside', 'Lakeside Sports Complex', 'Sports Complex', 'Multi-sport facility with tennis courts')
ON CONFLICT (id) DO NOTHING;

-- Insert sample courts for Sunrise Valley
INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights) VALUES
('sunrise-valley', 'Court 1', 1, 'Hard', 'Tennis', false, true),
('sunrise-valley', 'Court 2', 2, 'Hard', 'Tennis', false, true),
('sunrise-valley', 'Court 3', 3, 'Hard', 'Pickleball', false, true),
('sunrise-valley', 'Court 4', 4, 'Hard', 'Pickleball', false, true);

-- Insert sample courts for Downtown Tennis Center
INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights) VALUES
('downtown', 'Court A', 1, 'Hard', 'Tennis', true, true),
('downtown', 'Court B', 2, 'Hard', 'Tennis', true, true),
('downtown', 'Court C', 3, 'Clay', 'Tennis', false, true);

-- Insert sample courts for Riverside
INSERT INTO courts (facility_id, name, court_number, surface_type, court_type, is_indoor, has_lights) VALUES
('riverside', 'Court 1', 1, 'Grass', 'Tennis', false, true),
('riverside', 'Court 2', 2, 'Grass', 'Tennis', false, true),
('riverside', 'Court 3', 3, 'Hard', 'Tennis', false, true);

COMMENT ON TABLE users IS 'Stores user account information for both players and admins';
COMMENT ON TABLE facilities IS 'Stores information about tennis facilities/clubs';
COMMENT ON TABLE courts IS 'Stores information about individual courts within facilities';
COMMENT ON TABLE bookings IS 'Stores court booking/reservation information';
COMMENT ON TABLE hitting_partner_posts IS 'Stores posts from players looking for hitting partners';
COMMENT ON TABLE facility_memberships IS 'Links users to facilities they are members of';

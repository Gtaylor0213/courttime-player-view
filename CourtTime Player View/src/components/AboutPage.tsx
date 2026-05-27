import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle,
  Clock,
  Lock,
  Mail,
  Shield,
  Sparkles,
  Users,
  UserCheck,
} from 'lucide-react';

export function AboutPage() {
  const navigate = useNavigate();
  const supportEmail = 'reidbissell@courttimeapp.com';
  const demoRequestHref = `mailto:${supportEmail}?subject=${encodeURIComponent('CourtTime Demo Request')}&body=${encodeURIComponent(
    'Hi CourtTime team,\n\nI would like to schedule a demo for my facility.\n\nFacility name:\nNumber of courts:\nPreferred contact:\nPreferred demo time:\n\nThanks,',
  )}`;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-green-700 to-green-800 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="CourtTime" className="h-10 w-auto brightness-0 invert" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-white hover:bg-white/20" onClick={() => navigate('/login')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <Button className="bg-white text-green-800 hover:bg-green-50" onClick={() => navigate('/register/facility')}>
              Register Your Facility
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1668507911709-0249e832618d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjBjb3VydCUyMG91dGRvb3IlMjBzcG9ydHN8ZW58MXx8fHwxNzU4NzU5NDY3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Tennis court"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-32 text-center text-white">
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">
            Modern Court Management, Built for Real Clubs
          </h1>
          <p className="text-lg sm:text-xl text-gray-200 mb-8 max-w-2xl mx-auto leading-relaxed">
            CourtTime helps facilities run smooth daily operations with fair booking rules,
            clean member management, and a better player experience from login to reservation.
          </p>
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-white/15 border border-white/30 px-3 py-1 text-sm">Tennis clubs</span>
            <span className="rounded-full bg-white/15 border border-white/30 px-3 py-1 text-sm">HOA communities</span>
            <span className="rounded-full bg-white/15 border border-white/30 px-3 py-1 text-sm">Parks and rec</span>
            <span className="rounded-full bg-white/15 border border-white/30 px-3 py-1 text-sm">Private facilities</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate('/register/facility')}
              className="text-base px-8"
            >
              Register Your Facility
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/register')}
              className="text-base px-8 bg-white/10 border-white text-white hover:bg-white/20"
            >
              Create a Player Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 bg-white/10 border-white text-white hover:bg-white/20"
              asChild
            >
              <a href={demoRequestHref}>Request a Demo</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Core Value */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-green-800">What to Expect from CourtTime</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            The platform is designed to reduce admin workload while protecting fair access to courts.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<CalendarCheck className="h-8 w-8 text-green-600" />}
              title="Fast, Real-Time Booking"
              description="Members can view live availability and book in seconds from any device without calling the front desk."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8 text-green-600" />}
              title="Policy Enforcement Built In"
              description="Apply booking rules automatically, including limits, windows, and strike-based lockouts when needed."
            />
            <FeatureCard
              icon={<Users className="h-8 w-8 text-green-600" />}
              title="Member and Household Management"
              description="Manage members, households, approvals, and permissions in one place with less manual cleanup."
            />
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8 text-green-600" />}
              title="Admin Visibility"
              description="Use a centralized dashboard to manage schedules, monitor usage, and take action quickly."
            />
            <FeatureCard
              icon={<Clock className="h-8 w-8 text-green-600" />}
              title="Flexible Court Setup"
              description="Configure operating hours, court details, indoor/outdoor settings, and lighting options per court."
            />
            <FeatureCard
              icon={<Bell className="h-8 w-8 text-green-600" />}
              title="Member Communication"
              description="Keep your community informed with announcements, notices, and email-based updates."
            />
          </div>
        </div>
      </section>

      {/* Emphasis section */}
      <section className="bg-muted/30 py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-green-800">What We Emphasize</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            CourtTime focuses on consistency, fairness, and a better daily experience for both staff and players.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-green-200">
              <CardContent className="pt-6">
                <Sparkles className="h-7 w-7 text-green-600 mb-3" />
                <h3 className="font-semibold text-lg mb-2">Simplicity for Staff</h3>
                <p className="text-sm text-gray-600">Less time spent fixing booking conflicts and answering repetitive questions.</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="pt-6">
                <Lock className="h-7 w-7 text-green-600 mb-3" />
                <h3 className="font-semibold text-lg mb-2">Fair Access Controls</h3>
                <p className="text-sm text-gray-600">Consistent rules and strike lockouts help keep court access fair for everyone.</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="pt-6">
                <UserCheck className="h-7 w-7 text-green-600 mb-3" />
                <h3 className="font-semibold text-lg mb-2">Cleaner Member Experience</h3>
                <p className="text-sm text-gray-600">Players can register, book, and manage their account without unnecessary friction.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How to Sign Up */}
      <section className="bg-muted/30 py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-green-800">How to Register Your Facility</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Getting started takes just a few minutes. Here's how it works:
          </p>
          <div className="space-y-6">
            <StepItem
              number={1}
              title="Create Your Admin Account"
              description="Sign up with your name and email, or log in if you already have a CourtTime player account."
            />
            <StepItem
              number={2}
              title="Enter Facility Details"
              description="Add your facility profile, locations, contacts, and operating details."
            />
            <StepItem
              number={3}
              title="Configure Courts and Rules"
              description="Set up your courts, scheduling options, and booking policies to match how your facility operates."
            />
            <StepItem
              number={4}
              title="Complete Payment & Go Live"
              description="Finish annual billing, then invite members and start accepting bookings immediately."
            />
          </div>
        </div>
      </section>

      {/* Demo request */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 border-green-200 bg-green-50/40">
            <CardContent className="pt-8 pb-8 text-center">
              <BadgeCheck className="h-10 w-10 text-green-700 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-3 text-green-800">Want a Guided Demo?</h2>
              <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
                Share your facility details and we will walk you through setup, booking rules, and the best configuration for your courts.
              </p>
              <Button asChild size="lg">
                <a href={demoRequestHref}>Request a Demo</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-green-800">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
            Annual subscription pricing is based on court count: $50 per court per year,
            with a $200 annual minimum and $550 annual maximum.
          </p>
          <Card className="border-2 border-green-200 shadow-lg max-w-lg mx-auto text-left">
            <CardContent className="pt-8 pb-8">
              <div className="text-5xl font-bold mb-2 text-center">$50</div>
              <p className="text-gray-500 text-center mb-6">per court / year</p>
              <div className="space-y-2 text-sm text-gray-600 mb-6">
                <p className="flex justify-between"><span>1-4 courts</span><span className="font-medium text-gray-900">$200/year</span></p>
                <p className="flex justify-between"><span>5 courts</span><span className="font-medium text-gray-900">$250/year</span></p>
                <p className="flex justify-between"><span>10 courts</span><span className="font-medium text-gray-900">$500/year</span></p>
                <p className="flex justify-between"><span>11+ courts</span><span className="font-medium text-gray-900">$550/year (max)</span></p>
              </div>
              <div className="space-y-3 mb-8">
                <PricingFeature text="Unlimited members and bookings" />
                <PricingFeature text="Full admin dashboard" />
                <PricingFeature text="Custom booking rules and policies" />
                <PricingFeature text="Strike tracking and lockout controls" />
                <PricingFeature text="Member communication tools" />
                <PricingFeature text="Email notifications" />
                <PricingFeature text="Bulletin board" />
                <PricingFeature text="Household & family accounts" />
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => navigate('/register/facility')}
              >
                Get Started
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-muted/30 py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-green-800">Questions? Get in Touch</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Have questions about CourtTime or need help getting set up?
            We're here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <div className="flex items-center gap-2 text-gray-700">
              <Mail className="h-5 w-5 text-green-600" />
              <a href={`mailto:${supportEmail}`} className="hover:text-green-600 underline">
                {supportEmail}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t text-center text-sm text-gray-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="CourtTime" className="h-6 w-auto" />
            <span>&copy; {new Date().getFullYear()} CourtTime. All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <button onClick={() => navigate('/login')} className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm">Sign In</button>
            <button onClick={() => navigate('/register')} className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm">Create Account</button>
            <button onClick={() => navigate('/register/facility')} className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm">Register Facility</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-6">
        <div className="mb-4">{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepItem({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function PricingFeature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

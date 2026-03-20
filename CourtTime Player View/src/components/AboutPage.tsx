import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import {
  CalendarCheck,
  Users,
  Shield,
  BarChart3,
  Clock,
  Mail,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react';

export function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="CourtTime" className="h-10 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <Button onClick={() => navigate('/register/facility')}>
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
            Court Management Made Simple
          </h1>
          <p className="text-lg sm:text-xl text-gray-200 mb-8 max-w-2xl mx-auto leading-relaxed">
            CourtTime is a modern booking and management platform built for tennis clubs,
            HOA communities, recreation centers, and any facility with courts to manage.
          </p>
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
          </div>
        </div>
      </section>

      {/* What We Offer */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">What We Offer</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Everything your facility needs to manage courts, members, and bookings in one place.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<CalendarCheck className="h-8 w-8 text-green-600" />}
              title="Online Court Booking"
              description="Members can view real-time availability and book courts instantly from any device. No more phone calls or paper sign-up sheets."
            />
            <FeatureCard
              icon={<Users className="h-8 w-8 text-green-600" />}
              title="Member Management"
              description="Manage your member roster, track memberships, and control access. Support for households and family accounts."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8 text-green-600" />}
              title="Booking Rules & Policies"
              description="Set custom rules for booking limits, advance booking windows, cancellation policies, peak hours, and more."
            />
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8 text-green-600" />}
              title="Admin Dashboard"
              description="A full admin panel to manage courts, view bookings, send communications, and oversee your entire facility."
            />
            <FeatureCard
              icon={<Clock className="h-8 w-8 text-green-600" />}
              title="Flexible Scheduling"
              description="Configure operating hours, court-specific schedules, and support for indoor/outdoor courts with lighting options."
            />
            <FeatureCard
              icon={<Mail className="h-8 w-8 text-green-600" />}
              title="Communication Tools"
              description="Built-in bulletin board, email blasts, and notification system to keep your community informed and engaged."
            />
          </div>
        </div>
      </section>

      {/* How to Sign Up */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How to Register Your Facility</h2>
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
              description="Provide your facility name, address, contact info, and upload a photo. Set your operating hours and court information."
            />
            <StepItem
              number={3}
              title="Configure Your Courts"
              description="Add your courts with details like surface type, indoor/outdoor, and lighting. Support for up to 10 courts on the standard plan."
            />
            <StepItem
              number={4}
              title="Set Booking Rules"
              description="Customize booking limits, cancellation policies, peak hour restrictions, and other rules that fit your community."
            />
            <StepItem
              number={5}
              title="Complete Payment & Go Live"
              description="Finalize your subscription and start inviting members. Your facility is ready to accept bookings right away."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
            One plan that covers everything your facility needs.
          </p>
          <Card className="max-w-md mx-auto border-2 border-green-200 shadow-lg">
            <CardContent className="pt-8 pb-8">
              <div className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-2">
                Standard Plan
              </div>
              <div className="text-5xl font-bold mb-2">
                $404.06
              </div>
              <div className="text-gray-500 mb-6">per year</div>
              <div className="text-left space-y-3 mb-8">
                <PricingFeature text="Up to 10 courts included" />
                <PricingFeature text="Unlimited members and bookings" />
                <PricingFeature text="Full admin dashboard" />
                <PricingFeature text="Custom booking rules and policies" />
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
              <p className="text-xs text-gray-500 mt-3">
                Need more than 10 courts? Contact us for custom pricing.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Questions? Get in Touch</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Have questions about CourtTime or need help getting set up?
            We're here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <div className="flex items-center gap-2 text-gray-700">
              <Mail className="h-5 w-5 text-green-600" />
              <a href="mailto:support@courttime.app" className="hover:text-green-600 underline">
                support@courttime.app
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
            <button onClick={() => navigate('/login')} className="hover:text-green-600">Sign In</button>
            <button onClick={() => navigate('/register')} className="hover:text-green-600">Create Account</button>
            <button onClick={() => navigate('/register/facility')} className="hover:text-green-600">Register Facility</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
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

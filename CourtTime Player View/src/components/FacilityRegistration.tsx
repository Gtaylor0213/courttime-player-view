import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import { RegistrationProvider, useRegistration } from './facility-registration/RegistrationContext';
import { AdminAccountStep } from './facility-registration/AdminAccountStep';
import { FacilityInfoStep } from './facility-registration/FacilityInfoStep';
import { RulesAndWhitelistStep } from './facility-registration/RulesAndWhitelistStep';
import { CourtsStep } from './facility-registration/CourtsStep';
import { AdminsStep } from './facility-registration/AdminsStep';
import { ReviewStep } from './facility-registration/ReviewStep';
import { PaymentStep } from './facility-registration/PaymentStep';

function RegistrationProgressBar() {
  const { currentStep, totalSteps, getStepLabel, goToStep } = useRegistration();
  const progressPercent = totalSteps > 1 ? ((currentStep - 1) / (totalSteps - 1)) * 100 : 100;

  return (
    <motion.div className="mb-6 md:mb-8">
      <motion.div className="md:hidden space-y-3">
        <motion.div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-green-700 whitespace-nowrap">
            Step {currentStep} of {totalSteps}
          </span>
          <span className="text-gray-600 text-right truncate">{getStepLabel(currentStep)}</span>
        </motion.div>
        <motion.div className="h-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-green-700 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </motion.div>
        <motion.div
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
          role="tablist"
          aria-label="Registration steps"
        >
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep;
            const isVisited = stepNumber < currentStep;
            const label = getStepLabel(stepNumber);

            return (
              <button
                key={stepNumber}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => goToStep(stepNumber)}
                className={`snap-start shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'border-green-700 bg-green-700 text-white'
                    : isVisited
                      ? 'border-green-800 bg-green-50 text-green-800'
                      : 'border-gray-300 bg-white text-gray-600'
                }`}
                title={`Go to step ${stepNumber}: ${label}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                  {isVisited ? <Check className="h-3 w-3" /> : stepNumber}
                </span>
                <span className="max-w-[7rem] truncate sm:max-w-none">{label}</span>
              </button>
            );
          })}
        </motion.div>
        <p className="text-xs text-gray-500">
          Tap a step to jump ahead. All required fields must be completed before you submit.
        </p>
      </motion.div>

      <motion.div className="hidden md:block">
        <motion.div className="flex justify-between mb-2">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep;
            const isVisited = stepNumber < currentStep;

            let bgColor = 'white';
            let borderColor = '#d1d5db';
            let textColor = '#6b7280';

            if (isCurrent) {
              bgColor = '#15803d';
              borderColor = '#15803d';
              textColor = 'white';
            } else if (isVisited) {
              bgColor = '#166534';
              borderColor = '#166534';
              textColor = 'white';
            }

            return (
              <motion.div key={stepNumber} className="flex-1 flex items-start min-w-0">
                <motion.div className="flex flex-col items-center flex-1 min-w-0">
                  <motion.div
                    role="button"
                    tabIndex={0}
                    onClick={() => goToStep(stepNumber)}
                    onKeyDown={(e) => e.key === 'Enter' && goToStep(stepNumber)}
                    className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer hover:scale-105 font-medium shrink-0"
                    style={{
                      backgroundColor: bgColor,
                      borderColor,
                      borderWidth: '2px',
                      borderStyle: 'solid',
                      borderRadius: '9999px',
                      color: textColor,
                    }}
                    title={`Go to step ${stepNumber}: ${getStepLabel(stepNumber)}`}
                  >
                    {isVisited ? <Check className="h-5 w-5" /> : stepNumber}
                  </motion.div>
                  <motion.div
                    className="text-xs mt-2 text-center px-0.5 leading-tight truncate w-full max-w-[5.5rem]"
                    style={{ color: isCurrent ? '#15803d' : '#6b7280', fontWeight: isCurrent ? 600 : 400 }}
                  >
                    {getStepLabel(stepNumber)}
                  </motion.div>
                </motion.div>
                {stepNumber < totalSteps && (
                  <motion.div
                    className="flex-1 mx-2 mt-5 transition-colors min-w-[8px]"
                    style={{ backgroundColor: isVisited ? '#166534' : '#d1d5db', height: '2px' }}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>
        <p className="text-xs text-center text-gray-500">
          Click any step above to navigate. All required fields must be completed before registration.
        </p>
      </motion.div>
    </motion.div>
  );
}

function FacilityRegistrationContent() {
  const navigate = useNavigate();
  const {
    currentStep,
    totalSteps,
    preAuthenticated,
    handleBack,
    handleNext,
    handleSubmit,
    isSubmitting,
    paymentComplete,
    paymentWaived,
  } = useRegistration();

  return (
    <motion.div className="facility-registration min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-3 py-4 sm:p-4 pb-24 sm:pb-4">
      <Card className="w-full max-w-4xl shadow-sm">
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <motion.div className="flex flex-col items-center mb-4 sm:mb-6">
            <Button variant="ghost" onClick={() => navigate('/login')} className="self-start mb-3 sm:mb-4 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
            <img src={logoImage} alt="CourtTime" className="h-12 sm:h-16" />
          </motion.div>
          <CardTitle className="text-xl sm:text-2xl">Facility Registration</CardTitle>
          <CardDescription>Register your tennis or pickleball facility with CourtTime</CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <RegistrationProgressBar />

          <motion.div className="mt-6 sm:mt-8">
            {!preAuthenticated && currentStep === 1 && <AdminAccountStep />}
            {(preAuthenticated ? currentStep === 1 : currentStep === 2) && <FacilityInfoStep />}
            {(preAuthenticated ? currentStep === 2 : currentStep === 3) && <CourtsStep />}
            {(preAuthenticated ? currentStep === 3 : currentStep === 4) && <RulesAndWhitelistStep />}
            {(preAuthenticated ? currentStep === 4 : currentStep === 5) && <AdminsStep />}
            {(preAuthenticated ? currentStep === 5 : currentStep === 6) && <ReviewStep />}
            {(preAuthenticated ? currentStep === 6 : currentStep === 7) && <PaymentStep />}
          </motion.div>

          <motion.div className="facility-reg-nav sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 mt-6 sm:mt-8 bg-gray-50/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t sm:border-t-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between z-10">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {currentStep < totalSteps ? (
              <Button type="button" onClick={handleNext} className="w-full sm:w-auto">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || (!paymentComplete && !paymentWaived)}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? 'Submitting...' : 'Complete Registration'}
              </Button>
            )}
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function FacilityRegistration() {
  return (
    <RegistrationProvider>
      <FacilityRegistrationContent />
    </RegistrationProvider>
  );
}

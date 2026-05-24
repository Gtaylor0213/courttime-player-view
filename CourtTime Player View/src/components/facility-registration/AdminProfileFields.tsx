import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useRegistration } from './RegistrationContext';

export function AdminProfileFields() {
  const { formData, user, handleInputChange, handleAdminProfilePictureChange } = useRegistration();

  return (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="text-lg font-medium">Player Profile (Optional)</h3>
      <p className="text-sm text-gray-500">These fields are optional and can be updated later in your profile settings.</p>

      <div>
        <Label>Profile Picture</Label>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-2">
          <Avatar className="h-16 w-16">
            {formData.adminProfilePicture ? (
              <AvatarImage src={formData.adminProfilePicture} alt="Profile" />
            ) : null}
            <AvatarFallback className="text-lg">
              {(formData.adminFirstName || user?.firstName || '?')[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('adminProfilePicInput')?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              {formData.adminProfilePicture ? 'Change' : 'Upload'}
            </Button>
            {formData.adminProfilePicture && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleInputChange('adminProfilePicture', '')}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            id="adminProfilePicInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAdminProfilePictureChange}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="adminSkillLevel">Skill Level</Label>
          <Select
            value={formData.adminSkillLevel}
            onValueChange={(value) => handleInputChange('adminSkillLevel', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select skill level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
              <SelectItem value="Expert">Expert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="adminUstaRating">USTA/NTRP Rating</Label>
          <Select
            value={formData.adminUstaRating}
            onValueChange={(value) => handleInputChange('adminUstaRating', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2.0">2.0</SelectItem>
              <SelectItem value="2.5">2.5</SelectItem>
              <SelectItem value="3.0">3.0</SelectItem>
              <SelectItem value="3.5">3.5</SelectItem>
              <SelectItem value="4.0">4.0</SelectItem>
              <SelectItem value="4.5">4.5</SelectItem>
              <SelectItem value="5.0">5.0</SelectItem>
              <SelectItem value="5.5">5.5</SelectItem>
              <SelectItem value="6.0">6.0</SelectItem>
              <SelectItem value="6.5">6.5</SelectItem>
              <SelectItem value="7.0">7.0</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="adminBio">Bio</Label>
        <Textarea
          id="adminBio"
          value={formData.adminBio}
          onChange={(e) => {
            if (e.target.value.length <= 500) {
              handleInputChange('adminBio', e.target.value);
            }
          }}
          placeholder="Tell us a little about yourself..."
          rows={3}
        />
        <p className="text-xs text-gray-400 mt-1">{formData.adminBio.length}/500 characters</p>
      </div>
    </div>
  );
}

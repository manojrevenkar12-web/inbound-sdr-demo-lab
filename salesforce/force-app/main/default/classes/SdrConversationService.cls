/**
 * Writes a booked website conversation into the org.
 * - A retry with the same conversation id upserts the same Lead (external id Conversation_Id__c).
 * - If a Contact already has this email, the conversation is logged on the Contact and no Lead is created.
 * - The owner decided outside Salesforce is applied only if it resolves to an active user or a queue;
 *   otherwise the org's active assignment rule decides.
 * Runs in user mode, so field-level security and sharing of the integration user apply.
 */
public with sharing class SdrConversationService {
    public class Input {
        public String conversationId;
        public String company;
        public String email;
        public String country;
        public Integer employees;
        public String industry;
        public String ownerId;
        public String ownerType;
        public String routedVia;
        public String consentBasis;
        public String summary;
    }

    public class Result {
        public Id recordId;
        public String action;
        public Boolean created;
    }

    public class InvalidInputException extends Exception {
    }

    private static final Set<String> CONSENT_BASES = new Set<String>{ 'cmp_consent', 'in_chat_consent', 'not_required' };

    public static Result apply(Input input) {
        validate(input);
        Result result = new Result();

        List<Contact> contacts = [SELECT Id FROM Contact WHERE Email = :input.email WITH USER_MODE LIMIT 1];
        if (!contacts.isEmpty()) {
            insert as user activity(contacts[0].Id, input);
            result.recordId = contacts[0].Id;
            result.action = 'logged_on_contact';
            result.created = false;
            return result;
        }

        Lead lead = new Lead(
            Conversation_Id__c = input.conversationId,
            LastName = lastNameFrom(input.email),
            Company = String.isBlank(input.company) ? input.email.substringAfter('@') : input.company,
            Email = input.email,
            Country = input.country,
            NumberOfEmployees = input.employees,
            Industry = input.industry,
            LeadSource = 'Web Chat',
            Consent_Basis__c = input.consentBasis,
            Routed_Via__c = input.routedVia
        );
        Id ownerId = resolveOwner(input.ownerType, input.ownerId);
        if (ownerId != null) {
            lead.OwnerId = ownerId;
        } else {
            Database.DMLOptions options = new Database.DMLOptions();
            options.assignmentRuleHeader.useDefaultRule = true;
            lead.setOptions(options);
        }

        Database.UpsertResult upserted = Database.upsert(lead, Lead.Conversation_Id__c, true, AccessLevel.USER_MODE);
        if (upserted.isCreated()) {
            insert as user activity(upserted.getId(), input);
        }
        result.recordId = upserted.getId();
        result.action = upserted.isCreated() ? 'lead_created' : 'lead_updated';
        result.created = upserted.isCreated();
        return result;
    }

    @TestVisible
    private static void validate(Input input) {
        if (input == null || String.isBlank(input.conversationId) || input.conversationId.length() > 64) {
            throw new InvalidInputException('conversationId is required and at most 64 characters');
        }
        if (String.isBlank(input.email) || !Pattern.matches('[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}', input.email)) {
            throw new InvalidInputException('a valid email is required');
        }
        if (input.consentBasis == null || !CONSENT_BASES.contains(input.consentBasis)) {
            throw new InvalidInputException('consentBasis must be one of ' + String.join(new List<String>(CONSENT_BASES), ', '));
        }
    }

    @TestVisible
    private static Id resolveOwner(String ownerType, String ownerKey) {
        if (String.isBlank(ownerKey)) {
            return null;
        }
        if (ownerType == 'Queue') {
            List<Group> queues = [SELECT Id FROM Group WHERE Type = 'Queue' AND DeveloperName = :ownerKey WITH USER_MODE LIMIT 1];
            return queues.isEmpty() ? null : queues[0].Id;
        }
        List<User> users = [SELECT Id FROM User WHERE IsActive = TRUE AND (Username = :ownerKey OR Email = :ownerKey) WITH USER_MODE LIMIT 1];
        return users.isEmpty() ? null : users[0].Id;
    }

    private static String lastNameFrom(String email) {
        String local = email.substringBefore('@');
        String last = local.contains('.') ? local.substringAfterLast('.') : local;
        return last.capitalize().left(80);
    }

    private static Task activity(Id whoId, Input input) {
        return new Task(
            WhoId = whoId,
            Subject = 'Website conversation with the AI SDR',
            Description = input.summary == null ? '' : input.summary.left(32000),
            Status = 'Completed',
            ActivityDate = Date.today()
        );
    }
}

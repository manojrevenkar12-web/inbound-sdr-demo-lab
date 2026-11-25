@IsTest
private class SdrConversationServiceTest {
    private static SdrConversationService.Input input(String conversationId, String email) {
        SdrConversationService.Input i = new SdrConversationService.Input();
        i.conversationId = conversationId;
        i.email = email;
        i.company = 'Alpenblick Logistik';
        i.country = 'Germany';
        i.employees = 640;
        i.ownerType = 'User';
        i.ownerId = UserInfo.getUserName();
        i.routedVia = 'rule_entry';
        i.consentBasis = 'in_chat_consent';
        i.summary = 'Visitor: Do you have a DATEV integration?';
        return i;
    }

    @IsTest
    static void retriesUpsertTheSameLead() {
        Test.startTest();
        SdrConversationService.Result first = SdrConversationService.apply(input('c-1', 'anna.schmidt@alpenblick.example'));
        SdrConversationService.Result again = SdrConversationService.apply(input('c-1', 'anna.schmidt@alpenblick.example'));
        Test.stopTest();

        Assert.isTrue(first.created, 'first call creates the lead');
        Assert.isFalse(again.created, 'retry updates it');
        Assert.areEqual(first.recordId, again.recordId, 'same lead');
        Lead lead = [SELECT LastName, OwnerId, Consent_Basis__c, LeadSource FROM Lead WHERE Conversation_Id__c = 'c-1'];
        Assert.areEqual('Schmidt', lead.LastName, 'last name from the email');
        Assert.areEqual(UserInfo.getUserId(), lead.OwnerId, 'owner decided outside Salesforce is applied');
        Assert.areEqual('in_chat_consent', lead.Consent_Basis__c, 'consent basis kept');
        Assert.areEqual(1, [SELECT COUNT() FROM Task WHERE WhoId = :lead.Id], 'one activity, not one per retry');
    }

    @IsTest
    static void existingContactGetsTheActivityInsteadOfADuplicateLead() {
        Contact c = new Contact(LastName = 'Ward', Email = 'james.ward@ulmtal.example');
        insert c;
        SdrConversationService.Result r = SdrConversationService.apply(input('c-2', 'james.ward@ulmtal.example'));
        Assert.areEqual('logged_on_contact', r.action, 'logged on the contact');
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE Conversation_Id__c = 'c-2'], 'no duplicate lead');
        Assert.areEqual(1, [SELECT COUNT() FROM Task WHERE WhoId = :c.Id], 'activity on the contact');
    }

    @IsTest
    static void unknownOwnerFallsBackToTheAssignmentRule() {
        SdrConversationService.Input i = input('c-3', 'lea@kaprun.example');
        i.ownerId = 'nobody@nowhere.example';
        SdrConversationService.Result r = SdrConversationService.apply(i);
        Assert.isTrue(r.created, 'lead created');
        Assert.isNull(SdrConversationService.resolveOwner('User', 'nobody@nowhere.example'), 'owner not resolved');
    }

    @IsTest
    static void invalidInputIsRejected() {
        SdrConversationService.Input i = input('', 'x@y.example');
        try {
            SdrConversationService.apply(i);
            Assert.fail('expected an exception');
        } catch (SdrConversationService.InvalidInputException e) {
            Assert.isTrue(e.getMessage().contains('conversationId'), 'names the field');
        }
        SdrConversationService.Input j = input('c-4', 'x@y.example');
        j.consentBasis = 'assumed';
        try {
            SdrConversationService.apply(j);
            Assert.fail('expected an exception');
        } catch (SdrConversationService.InvalidInputException e) {
            Assert.isTrue(e.getMessage().contains('consentBasis'), 'consent basis is checked');
        }
    }

    @IsTest
    static void restResourceMapsErrorsToStatusCodes() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/sdr/v1/conversation';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('{"conversationId":"c-5","unexpected":true}');
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SdrConversationResource.upsertConversation();
        Assert.areEqual(400, RestContext.response.statusCode, 'unknown fields are rejected');

        req.requestBody = Blob.valueOf(JSON.serialize(input('c-6', 'nina@hoff.example')));
        RestContext.response = new RestResponse();
        SdrConversationResource.upsertConversation();
        Assert.areEqual(201, RestContext.response.statusCode, 'created');
    }
}
